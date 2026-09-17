// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager}           from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey}                from "v4-core/src/types/PoolKey.sol";
import {BalanceDelta}           from "v4-core/src/types/BalanceDelta.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {TickMath}               from "v4-core/src/libraries/TickMath.sol";
import {IERC20}                 from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}              from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard}        from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BondingCurveRouter
 * @notice Routeur minimal permettant aux EOA d'interagir avec BondingCurveHook V4.
 *
 * Le PoolManager V4 utilise un flash-accounting basé sur unlock() : seuls les
 * contrats peuvent initier un swap car le PM rappelle l'appelant via
 * unlockCallback(). Ce routeur sert d'intermédiaire pour les wallets EOA.
 *
 * ─── Flux d'un buy (USDC → meme) ───────────────────────────────────────────
 *   1. User approuve USDC à ce routeur
 *   2. User appelle swap(key, zeroForOne=true, amountSpecified=-usdcIn, ...)
 *   3. Router → poolManager.unlock(encodedData)
 *   4. PM → router.unlockCallback(data) → poolManager.swap(key, params, "")
 *   5. BondingCurveHook.beforeSwap intercepte et settle les balances
 *   6. Router transfère l'USDC du user au PM + prend les meme tokens pour le recipient
 *
 * ─── Flux d'un sell (meme → USDC) ──────────────────────────────────────────
 *   1. User approuve le meme token à ce routeur
 *   2. User appelle swap(key, zeroForOne=false si usdcIsC0, amountSpecified=-tokensIn, ...)
 *   3. Même mécanique, delta inversé
 */
contract BondingCurveRouter is ReentrancyGuard {
    using SafeERC20      for IERC20;
    using CurrencyLibrary for Currency;

    IPoolManager public immutable poolManager;

    // Sentinelles V4 — "aucune limite de prix" pour laisser le hook gérer
    uint160 internal constant SQRT_PRICE_MIN = TickMath.MIN_SQRT_PRICE + 1;
    uint160 internal constant SQRT_PRICE_MAX = TickMath.MAX_SQRT_PRICE - 1;

    struct CallbackData {
        PoolKey  key;
        bool     zeroForOne;
        int256   amountSpecified;
        address  payer;
        address  recipient;
    }

    error NotPoolManager();
    error InsufficientOutput(uint256 got, uint256 min);

    constructor(IPoolManager _poolManager) {
        poolManager = _poolManager;
    }

    // ─── swap ─────────────────────────────────────────────────────────────────

    /**
     * @notice Effectue un swap via BondingCurveHook.
     *
     * @param key              PoolKey (currency0 < currency1 en adresse lexicographique)
     * @param zeroForOne       true = currency0→currency1  |  false = currency1→currency0
     *                         Buy  (USDC→meme) : zeroForOne = (USDC < meme en adresse)
     *                         Sell (meme→USDC) : zeroForOne = (meme < USDC en adresse)
     * @param amountSpecified  < 0 = exact input  |  > 0 = exact output
     * @param recipient        Destinataire des tokens de sortie (0 = msg.sender)
     * @param minAmountOut     Protection slippage en unités brutes du token de sortie (0 = off)
     * @return amountOut       Montant brut reçu par le recipient (positif)
     */
    function swap(
        PoolKey  calldata key,
        bool     zeroForOne,
        int256   amountSpecified,
        address  recipient,
        uint256  minAmountOut
    ) external nonReentrant returns (int128 amountOut) {
        address to = recipient == address(0) ? msg.sender : recipient;

        bytes memory result = poolManager.unlock(abi.encode(CallbackData({
            key:             key,
            zeroForOne:      zeroForOne,
            amountSpecified: amountSpecified,
            payer:           msg.sender,
            recipient:       to
        })));

        (int128 d0, int128 d1) = abi.decode(result, (int128, int128));

        // amountOut = le delta positif du côté sortie
        amountOut = zeroForOne ? d1 : d0;

        if (minAmountOut > 0) {
            uint256 got = amountOut > 0 ? uint256(uint128(amountOut)) : 0;
            if (got < minAmountOut) revert InsufficientOutput(got, minAmountOut);
        }
    }

    // ─── unlockCallback ───────────────────────────────────────────────────────

    /**
     * @notice Appelé par le PoolManager dans le contexte de unlock().
     *         Exécute le swap puis règle les balances flash.
     */
    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();

        CallbackData memory d = abi.decode(rawData, (CallbackData));

        // Prix sentinel — aucune borne de prix ; le hook override tout dans beforeSwap
        uint160 sqrtLimit = d.zeroForOne ? SQRT_PRICE_MIN : SQRT_PRICE_MAX;

        // Déclenche beforeSwap dans BondingCurveHook
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
            // Router doit payer |delta0| de currency0 au PoolManager
            uint256 amt = uint256(uint128(-delta0));
            poolManager.sync(d.key.currency0);
            IERC20(Currency.unwrap(d.key.currency0)).safeTransferFrom(
                d.payer, address(poolManager), amt
            );
            poolManager.settle();
        } else if (delta0 > 0) {
            // PM doit |delta0| de currency0 au recipient
            poolManager.take(d.key.currency0, d.recipient, uint256(uint128(delta0)));
        }

        // ── Régler currency1 ──────────────────────────────────────────────────
        if (delta1 < 0) {
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
