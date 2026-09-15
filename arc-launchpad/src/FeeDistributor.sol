// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FeeDistributor
 * @notice Distribue les fees USDC aux holders du meme token qui ont staké.
 *
 * Mécanisme (modèle Synthetix StakingRewards) :
 *   - Les holders stakent leur meme token dans ce contrat
 *   - Quand V3LPVault.collectFees() est appelé, il transfère l'USDC ici via notifyReward()
 *   - rewardPerTokenStored augmente → chaque staker accumule un droit proportionnel
 *   - claim() retire les USDC accumulés
 *
 * Déployé par LaunchpadFactory uniquement si creator a activé holderRewards.
 * Le vault est le seul autorisé à appeler notifyReward().
 */
contract FeeDistributor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── État ─────────────────────────────────────────────────────────────

    IERC20  public stakingToken; // meme token
    IERC20  public usdc;         // rewards en USDC
    address public vault;        // V3LPVault — autorisé à notifyReward (post-grad)
    address public curve;        // BondingCurve — autorisé à notifyReward (pre-grad)

    /// @notice Accumulateur global : USDC par token staké × 1e18 (précision fixe)
    uint256 public rewardPerTokenStored;

    /// @notice Total de meme tokens stakés
    uint256 public totalStaked;

    /// @notice Balance stakée par user
    mapping(address => uint256) public staked;

    /// @notice Snapshot de rewardPerTokenStored au dernier update de l'user
    mapping(address => uint256) public rewardDebt;

    /// @notice USDC accumulés non encore réclamés par user
    mapping(address => uint256) public pendingRewards;

    // ─── Protège initialize() ─────────────────────────────────────────────
    bool private _initialized;

    // ─── Events ──────────────────────────────────────────────────────────

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);
    event RewardNotified(uint256 amount, uint256 newRewardPerToken);

    // ─── Initializer ──────────────────────────────────────────────────────

    /**
     * @notice Appelé une seule fois par LaunchpadFactory.
     * @param stakingToken_ Adresse du meme token
     * @param usdc_         Adresse USDC (0x3600…0000 sur Arc)
     * @param vault_        Adresse du V3LPVault (autorisé à notifyReward post-grad)
     * @param curve_        Adresse du BondingCurve (autorisé à notifyReward pre-grad)
     */
    function initialize(
        address stakingToken_,
        address usdc_,
        address vault_,
        address curve_
    ) external {
        require(!_initialized,              "FeeDistributor: already initialized");
        require(stakingToken_ != address(0), "FeeDistributor: zero token");
        require(usdc_         != address(0), "FeeDistributor: zero usdc");
        require(vault_        != address(0), "FeeDistributor: zero vault");
        require(curve_        != address(0), "FeeDistributor: zero curve");

        _initialized = true;
        stakingToken = IERC20(stakingToken_);
        usdc         = IERC20(usdc_);
        vault        = vault_;
        curve        = curve_;
    }

    // ─── Appelé par V3LPVault ─────────────────────────────────────────────

    /**
     * @notice V3LPVault transfère l'USDC ici AVANT d'appeler cette fonction.
     *         Met à jour rewardPerTokenStored.
     *         Si personne n'a staké, l'USDC reste dans le contrat pour le prochain appel.
     * @param amount USDC reçus (6 dec)
     */
    function notifyReward(uint256 amount) external {
        require(msg.sender == vault || msg.sender == curve, "FeeDistributor: unauthorized");
        require(amount > 0,          "FeeDistributor: zero amount");

        if (totalStaked > 0) {
            // Augmenter le reward par token (× 1e18 pour la précision fixe)
            rewardPerTokenStored += amount * 1e18 / totalStaked;
        }
        // Si totalStaked == 0, l'USDC reste dans le contrat et sera distribué
        // lors du prochain notifyReward quand il y aura des stakers.

        emit RewardNotified(amount, rewardPerTokenStored);
    }

    // ─── Actions user ─────────────────────────────────────────────────────

    /**
     * @notice Stake des meme tokens pour commencer à gagner des fees USDC.
     *         Nécessite une approbation préalable sur stakingToken.
     * @param amount Montant à staker (18 dec)
     */
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "FeeDistributor: zero amount");

        _updateReward(msg.sender);

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        staked[msg.sender] += amount;
        totalStaked        += amount;

        emit Staked(msg.sender, amount);
    }

    /**
     * @notice Retire des tokens stakés.
     *         Les rewards accumulés restent pending — appeler claim() séparément.
     * @param amount Montant à retirer (18 dec)
     */
    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0,                      "FeeDistributor: zero amount");
        require(staked[msg.sender] >= amount,    "FeeDistributor: insufficient stake");

        _updateReward(msg.sender);

        staked[msg.sender] -= amount;
        totalStaked        -= amount;
        stakingToken.safeTransfer(msg.sender, amount);

        emit Unstaked(msg.sender, amount);
    }

    /**
     * @notice Réclame tous les USDC rewards accumulés.
     */
    function claim() external nonReentrant {
        _updateReward(msg.sender);

        uint256 reward = pendingRewards[msg.sender];
        require(reward > 0, "FeeDistributor: nothing to claim");

        pendingRewards[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, reward);

        emit RewardClaimed(msg.sender, reward);
    }

    /**
     * @notice Unstake + claim en une seule TX.
     */
    function exit() external nonReentrant {
        _updateReward(msg.sender);

        uint256 stakeAmt = staked[msg.sender];
        uint256 reward   = pendingRewards[msg.sender];

        if (stakeAmt > 0) {
            staked[msg.sender] = 0;
            totalStaked       -= stakeAmt;
            stakingToken.safeTransfer(msg.sender, stakeAmt);
            emit Unstaked(msg.sender, stakeAmt);
        }

        if (reward > 0) {
            pendingRewards[msg.sender] = 0;
            usdc.safeTransfer(msg.sender, reward);
            emit RewardClaimed(msg.sender, reward);
        }
    }

    // ─── View helpers ─────────────────────────────────────────────────────

    /**
     * @notice USDC claimables par un user (sans state change).
     */
    function claimable(address user) external view returns (uint256) {
        uint256 delta = rewardPerTokenStored - rewardDebt[user];
        return pendingRewards[user] + (staked[user] * delta / 1e18);
    }

    // ─── Interne ──────────────────────────────────────────────────────────

    /**
     * @dev Met à jour les rewards pending de l'user avant tout changement de stake.
     */
    function _updateReward(address user) internal {
        uint256 delta = rewardPerTokenStored - rewardDebt[user];
        if (delta > 0 && staked[user] > 0) {
            pendingRewards[user] += staked[user] * delta / 1e18;
        }
        rewardDebt[user] = rewardPerTokenStored;
    }
}
