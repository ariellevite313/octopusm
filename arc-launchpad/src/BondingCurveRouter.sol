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
 * Solution : pré-financer le PM AVANT poolManager.swap(), puis utiliser les
 * DELTAS NETS (marginal swap + pré-financement) pour le règlement final.
 *
 * ─── Buy (USDC natif → meme) ─────────────────────────────────────────────────
 *   1. msg.value = montant USDC natif envoyé au router
 *   2. unlockCallback :
 *      a. settle{value: nativeValue}() → PM reçoit native, preSettled0 = +nativeValue
 *      b. poolManager.swap() → hook.beforeSwap prend le native depuis PM ✓
 *         Retourne delta marginal : amount0 = -usdcGross, amount1 = +tokensOut
 *      c. net0 = -usdcGross + nativeValue ≥ 0 (surplus rendu à l'user)
 *         net1 = +tokensOut → take(meme, recipient) ✓
 *
 * ─── Sell (meme → USDC natif) ────────────────────────────────────────────────
 *   1. User approuve le meme token à CE routeur
 *   2. unlockCallback :
 *      a. sync + safeTransferFrom(user, PM, tokensIn) + settle → preSettled1 = +tokensIn
 *      b. poolManager.swap() → hook.beforeSwap prend les meme depuis PM ✓
 *         Retourne delta marginal : amount0 = +usdcOut, amount1 = -tokensIn
 *      c. net0 = +usdcOut → take(native, recipient) ✓
 *         net1 = -tokensIn + tokensIn = 0 ✓ (pas de double-paiement)
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

    /// @notice Accepte le retour de native USDC (surplus après partial fill).
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

        // Rembourser le surplus de native éventuel (leftover après partial fill)
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

        // ── Comptabilité du pré-financement ───────────────────────────────────
        // Le delta marginal retourné par swap() ne tient pas compte des opérations
        // déjà effectuées (settle/sync avant le swap). On doit calculer le delta NET.
        int256 preSettled0 = 0; // crédit pré-versé sur currency0
        int256 preSettled1 = 0; // crédit pré-versé sur currency1

        // ── Pré-financer le PM AVANT le swap ──────────────────────────────────
        if (d.nativeValue > 0) {
            // Buy : settle le native → PM reçoit USDC avant que le hook l'appelle via take()
            poolManager.settle{value: d.nativeValue}();
            preSettled0 = int256(d.nativeValue);
        } else if (!d.zeroForOne) {
            // Sell : transférer les meme tokens → PM les reçoit avant le take() du hook
            uint256 memeAmt = uint256(-d.amountSpecified);
            poolManager.sync(d.key.currency1);
            IERC20(Currency.unwrap(d.key.currency1)).safeTransferFrom(
                d.payer, address(poolManager), memeAmt
            );
            poolManager.settle();
            preSettled1 = int256(memeAmt);
        }

        // ── Swap (hook.beforeSwap s'exécute ici avec les tokens déjà en PM) ──
        BalanceDelta delta = poolManager.swap(
            d.key,
            IPoolManager.SwapParams({
                zeroForOne:        d.zeroForOne,
                amountSpecified:   d.amountSpecified,
                sqrtPriceLimitX96: sqrtLimit
            }),
            ""
        );

        // ── Delta net = delta marginal du swap + crédit du pré-financement ────
        // Exemple buy  : marginal (−usdcGross, +tokensOut) + (nativeValue, 0)
        //              → net (nativeValue−usdcGross, +tokensOut)
        // Exemple sell : marginal (+usdcOut, −tokensIn)   + (0, +tokensIn)
        //              → net (+usdcOut, 0)
        int256 net0 = int256(delta.amount0()) + preSettled0;
        int256 net1 = int256(delta.amount1()) + preSettled1;

        // ── Règlement final basé sur le delta net ─────────────────────────────

        if (net0 < 0) {
            // Doit encore du native au PM (partial fill extrême, ne devrait pas arriver)
            poolManager.settle{value: uint256(-net0)}();
        } else if (net0 > 0) {
            // PM doit du native (surplus de pré-financement ou usdcOut pour vente)
            poolManager.take(d.key.currency0, d.recipient, uint256(net0));
        }

        if (net1 < 0) {
            // Doit encore des meme au PM (ne devrait pas arriver après pré-financement)
            uint256 amt = uint256(-net1);
            poolManager.sync(d.key.currency1);
            IERC20(Currency.unwrap(d.key.currency1)).safeTransferFrom(
                d.payer, address(poolManager), amt
            );
            poolManager.settle();
        } else if (net1 > 0) {
            // PM doit des meme (tokensOut pour achat, surplus meme pour vente partielle)
            poolManager.take(d.key.currency1, d.recipient, uint256(net1));
        }

        return abi.encode(delta.amount0(), delta.amount1());
    }
}
