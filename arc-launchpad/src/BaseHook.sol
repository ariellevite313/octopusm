// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks}       from "v4-core/src/interfaces/IHooks.sol";
import {Hooks}        from "v4-core/src/libraries/Hooks.sol";
import {PoolKey}      from "v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta} from "v4-core/src/types/BeforeSwapDelta.sol";

/**
 * @title BaseHook
 * @notice Implémentation minimale de BaseHook pour les hooks V4.
 *         Remplacement local de v4-periphery/BaseHook (absent dans cette version).
 */
abstract contract BaseHook is IHooks {

    IPoolManager public immutable poolManager;

    error NotPoolManager();
    error HookNotImplemented();

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    constructor(IPoolManager _poolManager) {
        poolManager = _poolManager;
        validateHookAddress(this);
    }

    function validateHookAddress(BaseHook _this) internal pure {
        Hooks.validateHookPermissions(_this, getHookPermissions());
    }

    function getHookPermissions() public pure virtual returns (Hooks.Permissions memory);

    // ─── IHooks implementation ─────────────────────────────────────────────

    function beforeInitialize(address, PoolKey calldata, uint160)
        external virtual onlyPoolManager returns (bytes4)
    { revert HookNotImplemented(); }

    function afterInitialize(address sender, PoolKey calldata key, uint160 sqrtPrice, int24 tick)
        external virtual onlyPoolManager returns (bytes4)
    {
        return _afterInitialize(sender, key, sqrtPrice, tick, "");
    }

    // afterInitialize with hookData — called by PoolManager
    function afterInitialize(address sender, PoolKey calldata key, uint160 sqrtPrice, int24 tick, bytes calldata hookData)
        external virtual onlyPoolManager returns (bytes4)
    {
        return _afterInitialize(sender, key, sqrtPrice, tick, hookData);
    }

    function beforeAddLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external virtual onlyPoolManager returns (bytes4)
    { revert HookNotImplemented(); }

    function afterAddLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, BalanceDelta, BalanceDelta, bytes calldata)
        external virtual onlyPoolManager returns (bytes4, BalanceDelta)
    { revert HookNotImplemented(); }

    function beforeRemoveLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external virtual onlyPoolManager returns (bytes4)
    { revert HookNotImplemented(); }

    function afterRemoveLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, BalanceDelta, BalanceDelta, bytes calldata)
        external virtual onlyPoolManager returns (bytes4, BalanceDelta)
    { revert HookNotImplemented(); }

    function beforeSwap(address sender, PoolKey calldata key, IPoolManager.SwapParams calldata params, bytes calldata hookData)
        external virtual onlyPoolManager returns (bytes4, BeforeSwapDelta, uint24)
    {
        return _beforeSwap(sender, key, params, hookData);
    }

    function afterSwap(address, PoolKey calldata, IPoolManager.SwapParams calldata, BalanceDelta, bytes calldata)
        external virtual onlyPoolManager returns (bytes4, int128)
    { revert HookNotImplemented(); }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external virtual onlyPoolManager returns (bytes4)
    { revert HookNotImplemented(); }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external virtual onlyPoolManager returns (bytes4)
    { revert HookNotImplemented(); }

    // ─── Hooks internes à surcharger ───────────────────────────────────────

    function _afterInitialize(address, PoolKey calldata, uint160, int24, bytes calldata)
        internal virtual returns (bytes4)
    { revert HookNotImplemented(); }

    function _beforeSwap(address, PoolKey calldata, IPoolManager.SwapParams calldata, bytes calldata)
        internal virtual returns (bytes4, BeforeSwapDelta, uint24)
    { revert HookNotImplemented(); }

    // ─── Selectors ─────────────────────────────────────────────────────────

    // Expose selectors for return values
    bytes4 internal constant _AFTER_INITIALIZE_SELECTOR  = IHooks.afterInitialize.selector;
    bytes4 internal constant _BEFORE_SWAP_SELECTOR       = IHooks.beforeSwap.selector;
}
