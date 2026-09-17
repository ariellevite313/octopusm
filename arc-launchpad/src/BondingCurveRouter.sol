// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager}              from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey}                   from "v4-core/src/types/PoolKey.sol";
import {BalanceDelta}              from "v4-core/src/types/BalanceDelta.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {TickMath}                  from "v4-core/src/libraries/TickMath.sol";
import {IERC20}                    from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}                 from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard}           from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BondingCurveRouter
 * @notice Routeur minimal permettant aux EOA d'interagir avec BondingCurveHook V4.
 *
 * Sur Arc, USDC est le token NATIF de la chaîne (address(0) en Uniswap V4).
 * Le routeur accepte du native ETH (= USDC Arc) via msg.value pour les buys.
 *
 * ─── Flux d'un buy (USDC natif → meme) ─────────────────────────────────────
 *   1. User appelle swap(...) avec msg.value = montant USDC natif
 *   2. Router → poolManager.unlock(encodedData)
 *   3. PM → router.unlockCallback(data) → poolManager.swap(key, params, "")
 *   4. BondingCurveHook.beforeSwap intercepte et settle les balances
 *   5. Router settle le native ETH → poolManager.settle{value: amt}()
 *   6. Router prend les meme tokens pour le recipient via poolManager.take()
 *
 * ─── Flux d'un sell (meme → USDC natif) ────────────────────────────────────
 *   1. User approuve le meme token à ce routeur
 *   2. User appelle swap(key, zeroForOne=false, amountSpecified=-tokensIn, ...)
 *   3. Router settle le meme ERC-20 via safeTransferFrom
 *   4. Router prend le USDC natif via poolManager.take() → envoyé au recipient
 */
contract BondingCurveRouter is ReentrancyGuard {
    using SafeERC20      for IERC20;
    using CurrencyLibrary for Currency;

    IPoolManager public immutable poolManager;

    uint160 internal constant SQRT_PRICE_MIN = TickMath.MIN_SQRT_PRICE + 1;
    uint160 internal constant SQRT_PRICE_MAX = TickMath.MAX_SQRT_PRICE - 1;

    struct CallbackData {
        PoolKey  key;
        bool     zeroForOne;
        int256   amountSpecified;
        address  payer;
        address  recipient;
        uint256  nativeValue; // msg.value transmis pour les buys natifs
    }

    error NotPoolManager();
    error InsufficientOutput(uint256 got, uint256 min);
    error NativeTransferFailed();

    constructor(IPoolManager _poolManager) {
        poolManager = _poolManager;
    }

    /// @notice Accepte le retour de native ETH depuis le PoolManager (take sur USDC natif).
    receive() external payable {}

    // ─── swap ─────────────────────────────────────────────────────────────────

    /**
     * @notice Effectue un swap via BondingCurveHook.
     *
     * Buy  (USDC natif → meme) : envoyer msg.value = montant USDC en wei (18 dec)
     * Sell (meme → USDC natif) : approuver le meme token d'abord, msg.value = 0
     */
    function swap(
        PoolKey  calldata key,
        bool     zeroForOne,
        int256   amountSpecified,
        address  recipient,
        uint256  minAmountOut
    ) external payable nonReentrant returns (int128 amountOut) {
        address to = recipient == address(0) ? msg.sender : recipient;

        bytes memory result = poolManager.unlock(abi.encode(CallbackData({
            key:             key,
            zeroForOne:      zeroForOne,
            amountSpecified: amountSpecified,
            payer:           msg.sender,
            recipient:       to,
            nativeValue:     msg.value
        })));

        (int128 d0, int128 d1) = abi.decode(result, (int128, int128));
        amountOut = zeroForOne ? d1 : d0;

        if (minAmountOut > 0) {
            uint256 got = amountOut > 0 ? uint256(uint128(amountOut)) : 0;
            if (got < minAmountOut) revert InsufficientOutput(got, minAmountOut);
        }

        // Rembourser le surplus de native ETH (si le hook a pris moins que msg.value)
        uint256 leftover = address(this).balance;
        if (leftover > 0) {
            (bool ok,) = payable(msg.sender).call{value: leftover}("");
            if (!ok) revert NativeTransferFailed();
        }
    }

    // ─── unlockCallback ───────────────────────────────────────────────────────

    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();

        CallbackData memory d = abi.decode(rawData, (CallbackData));
        uint160 sqrtLimit = d.zeroForOne ? SQRT_PRICE_MIN : SQRT_PRICE_MAX;

        BalanceDelta delta = poolManager.swap(
            d.key,
            IPoolManager.SwapParams({
                zeroForOne:        d.zeroForOne,
                amountSpecified:   d.amountSpecified,
                sqrtPriceLimitX96: sqrtLimit
            }),
            ""
        );

        int128 delta0 = delta.amount0();
        int128 delta1 = delta.amount1();

        // ── Régler currency0 ──────────────────────────────────────────────────
        if (delta0 < 0) {
            uint256 amt = uint256(uint128(-delta0));
            _payToManager(d.key.currency0, d.payer, amt, d.nativeValue);
        } else if (delta0 > 0) {
            poolManager.take(d.key.currency0, d.recipient, uint256(uint128(delta0)));
        }

        // ── Régler currency1 ──────────────────────────────────────────────────
        if (delta1 < 0) {
            uint256 amt = uint256(uint128(-delta1));
            _payToManager(d.key.currency1, d.payer, amt, d.nativeValue);
        } else if (delta1 > 0) {
            poolManager.take(d.key.currency1, d.recipient, uint256(uint128(delta1)));
        }

        return abi.encode(delta0, delta1);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    /**
     * @dev Règle `amount` de `currency` au PoolManager.
     *      Si native : poolManager.settle{value: amount}()
     *      Si ERC-20 : sync + safeTransferFrom + settle
     */
    function _payToManager(
        Currency currency,
        address  payer,
        uint256  amount,
        uint256  /*nativeValue — pour info, non utilisé directement*/
    ) internal {
        if (Currency.unwrap(currency) == address(0)) {
            // Native USDC Arc — déjà dans le router via msg.value
            poolManager.settle{value: amount}();
        } else {
            poolManager.sync(currency);
            IERC20(Currency.unwrap(currency)).safeTransferFrom(
                payer, address(poolManager), amount
            );
            poolManager.settle();
        }
    }
}
