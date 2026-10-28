// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title DirectV4Router
 * @notice Routeur minimal pour acheter et vendre un token lancé directement sur Uniswap V4 (USDC natif / token,
 *         frais 0,50 %, hook 0x0). Sans état, sans propriétaire, ne détient jamais de fonds entre deux appels.
 *  - buy  : envoyer l'USDC natif avec l'appel ; les tokens vont à `to`.
 *  - sell : approuver ce routeur sur le token ; l'USDC natif va à `to`.
 *  - quoteBuy / quoteSell : à appeler en eth_call (simulation) pour connaître le montant reçu.
 */
contract DirectV4Router is IUnlockCallback {
    IPoolManager public immutable poolManager;
    uint24 public constant FEE = 5_000;
    int24  public constant TICK_SPACING = 60;

    struct Op { address token; bool buy; uint256 amountIn; address to; address payer; bool quoteOnly; }

    error QuoteResult(uint256 out);

    constructor(IPoolManager pm_) { poolManager = pm_; }

    function key(address token) public pure returns (PoolKey memory) {
        return PoolKey({currency0: Currency.wrap(address(0)), currency1: Currency.wrap(token), fee: FEE, tickSpacing: TICK_SPACING, hooks: IHooks(address(0))});
    }

    function buy(address token, uint256 minOut, address to) external payable returns (uint256 out) {
        require(msg.value > 0, "R: no value");
        out = abi.decode(poolManager.unlock(abi.encode(Op(token, true, msg.value, to, msg.sender, false))), (uint256));
        require(out >= minOut, "R: slippage");
    }

    function sell(address token, uint256 amountIn, uint256 minOut, address to) external returns (uint256 out) {
        require(amountIn > 0, "R: no amount");
        out = abi.decode(poolManager.unlock(abi.encode(Op(token, false, amountIn, to, msg.sender, false))), (uint256));
        require(out >= minOut, "R: slippage");
    }

    /// @notice Simulation : tokens reçus pour `usdcIn` USDC natif (appeler en eth_call).
    function quoteBuy(address token, uint256 usdcIn) external returns (uint256 out) { return _quote(Op(token, true, usdcIn, address(0), address(0), true)); }

    /// @notice Simulation : USDC natif reçu pour `tokensIn` tokens (appeler en eth_call).
    function quoteSell(address token, uint256 tokensIn) external returns (uint256 out) { return _quote(Op(token, false, tokensIn, address(0), address(0), true)); }

    function _quote(Op memory op) internal returns (uint256) {
        try poolManager.unlock(abi.encode(op)) {
            revert("R: quote failed");
        } catch (bytes memory reason) {
            if (reason.length == 36 && bytes4(reason) == QuoteResult.selector) {
                uint256 out;
                assembly { out := mload(add(reason, 36)) }
                return out;
            }
            assembly { revert(add(reason, 32), mload(reason)) }
        }
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "R: only pool manager");
        Op memory op = abi.decode(data, (Op));
        PoolKey memory k = key(op.token);
        BalanceDelta delta = poolManager.swap(
            k,
            SwapParams({
                zeroForOne: op.buy,
                amountSpecified: -int256(op.amountIn),
                sqrtPriceLimitX96: op.buy ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            bytes("")
        );
        uint256 out = op.buy ? uint256(uint128(delta.amount1())) : uint256(uint128(delta.amount0()));
        uint256 spent = op.buy ? uint256(uint128(-delta.amount0())) : uint256(uint128(-delta.amount1()));
        require(spent == op.amountIn, "R: partial fill");
        if (op.quoteOnly) revert QuoteResult(out);

        if (op.buy) {
            poolManager.settle{value: op.amountIn}();
            poolManager.take(k.currency1, op.to, out);
        } else {
            poolManager.sync(k.currency1);
            require(IERC20(op.token).transferFrom(op.payer, address(poolManager), op.amountIn), "R: transfer");
            poolManager.settle();
            poolManager.take(k.currency0, op.to, out);
        }
        return abi.encode(out);
    }

    receive() external payable {}
}
