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
 * @notice Routeur EOA pour BondingCurveHook V4 sur Arc.
 *
 * USDC est le token NATIF d'Arc (address(0) en Uniswap V4).
 *
 * ─── Problème résolu ─────────────────────────────────────────────────────────
 * Le hook appelle poolManager.take(inputCurrency, hook, amount) dans beforeSwap.
 * Ce take() est physique : le PM doit avoir les tokens AVANT l'appel.
 * Il faut donc pré-financer le PM AVANT poolManager.swap().
 *
 * ─── Buy (USDC natif → meme) ─────────────────────────────────────────────────
 *   1. msg.value = montant USDC natif envoyé au router
 *   2. unlockCallback : poolManager.settle{value: nativeValue}() → PM reçoit le native
 *   3. poolManager.swap() → hook.beforeSwap : take(native, hook, usdcGross) ✓ PM a le native
 *   4. delta0 ≥ 0 (surplus si partial fill → rendu à l'user), delta1 > 0 → take(meme, user)
 *
 * ─── Sell (meme → USDC natif) ────────────────────────────────────────────────
 *   1. User approuve le meme token à CE routeur
 *   2. unlockCallback : sync + safeTransferFrom(user, PM, tokensIn) + settle → PM reçoit meme
 *   3. poolManager.swap() → hook.beforeSwap : take(meme, hook, tokensIn) ✓ PM a les meme
 *   4. delta1 ≥ 0 (surplus rendu à user), delta0 > 0 → take(native, user, usdcOut)
 */
contract BondingCurveRouter is ReentrancyGuard {
    using SafeERC20       for IERC20;
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
        uint256  nativeValue; // msg.value (buys natifs)
    }

    error NotPoolManager();
    error InsufficientOutput(uint256 got, uint256 min);
    error NativeTransferFailed();

    constructor(IPoolManager _poolManager) {
        poolManager = _poolManager;
    }

    /// @notice Accepte le retour de native USDC (take ou leftover depuis le PM / hook).
    receive() external payable {}

    // ─── swap ─────────────────────────────────────────────────────────────────

    /**
     * @notice Effectue un swap via BondingCurveHook.
     *
     * Buy  (USDC natif → meme) : envoyer msg.value = montant USDC (18 dec)
     * Sell (meme → USDC natif) : approuver ce routeur pour le meme token d'abord
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

        // Rembourser le surplus de native (partial fill ou arrondi)
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

        // ── Pré-financer le PM AVANT le swap ──────────────────────────────────
        // Le hook appelle take(inputCurrency, hook, amount) dans beforeSwap.
        // Ce take() physique nécessite que le PM ait déjà les tokens.
        if (d.nativeValue > 0) {
            // Buy : pré-settle le native USDC → PM reçoit le native avant le swap
            poolManager.settle{value: d.nativeValue}();
        } else if (!d.zeroForOne) {
            // Sell : pré-transférer les meme tokens (currency1) du payer vers le PM
            // amountSpecified est négatif (exact-input) → amount = -amountSpecified
            uint256 memeAmt = uint256(-d.amountSpecified);
            poolManager.sync(d.key.currency1);
            IERC20(Currency.unwrap(d.key.currency1)).safeTransferFrom(
                d.payer, address(poolManager), memeAmt
            );
            poolManager.settle();
        }

        // ── Appel du swap (hook.beforeSwap s'exécute ici) ────────────────────
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

        // ── Règlement post-swap ───────────────────────────────────────────────
        // Après pré-financement et traitement complet par le hook, les deltas sont :
        // Buy  : delta0 ≥ 0 (surplus natif si partial fill), delta1 > 0 (meme output)
        // Sell : delta1 ≥ 0 (surplus meme si partial fill), delta0 > 0 (native output)

        if (delta0 < 0) {
            // Ne devrait pas arriver après le pré-financement, mais on gère le cas
            poolManager.settle{value: uint256(uint128(-delta0))}();
        } else if (delta0 > 0) {
            // PM doit du native au locker → prendre pour le recipient (ou router pour remboursement)
            poolManager.take(d.key.currency0, d.recipient, uint256(uint128(delta0)));
        }

        if (delta1 < 0) {
            // Ne devrait pas arriver après le pré-financement, mais on gère
            uint256 amt = uint256(uint128(-delta1));
            poolManager.sync(d.key.currency1);
            IERC20(Currency.unwrap(d.key.currency1)).safeTransferFrom(
                d.payer, address(poolManager), amt
            );
            poolManager.settle();
        } else if (delta1 > 0) {
            poolManager.take(d.key.currency1, d.recipient, uint256(uint128(delta1)));
        }

        return abi.encode(delta0, delta1);
    }
}
