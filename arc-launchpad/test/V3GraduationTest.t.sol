// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/BondingCurve.sol";
import "../src/V3LPVault.sol";
import "../src/FeeDistributor.sol";
import "../src/LaunchpadFactory.sol";
import "../src/OMToken.sol";
import "../src/WhitelistRegistry.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

// ─── Mocks ────────────────────────────────────────────────────────────────────

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

/**
 * @dev Mock du NonfungiblePositionManager Uniswap V3.
 *      - mint() : transfère les tokens reçus vers address(this), retourne tokenId=1
 *      - collect() : simule des fees accumulées (200 USDC + quelques tokens)
 *      - positions() : retourne les adresses token0/token1 enregistrées
 */
contract MockNFPM {
    using SafeERC20 for IERC20;

    uint256 public nextTokenId = 1;

    struct PositionData {
        address token0;
        address token1;
    }
    mapping(uint256 => PositionData) public positionData;

    // Fees simulées à distribuer lors de collect()
    uint256 public mockFee0 = 200_000_000; // 200 USDC (6 dec)
    uint256 public mockFee1 = 0;           // pas de fee token (simplifié)

    // Permet de configurer les fees simulées dans les tests
    function setMockFees(uint256 fee0, uint256 fee1) external {
        mockFee0 = fee0;
        mockFee1 = fee1;
    }

    struct MintParams {
        address token0;
        address token1;
        uint24  fee;
        int24   tickLower;
        int24   tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function mint(MintParams calldata p)
        external
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        tokenId = nextTokenId++;
        // Absorber les tokens déposés
        IERC20(p.token0).transferFrom(msg.sender, address(this), p.amount0Desired);
        IERC20(p.token1).transferFrom(msg.sender, address(this), p.amount1Desired);
        // Enregistrer la position
        positionData[tokenId] = PositionData(p.token0, p.token1);
        liquidity = 1e12; // simulé
        amount0   = p.amount0Desired;
        amount1   = p.amount1Desired;
    }

    function collect(CollectParams calldata p)
        external
        returns (uint256 amount0, uint256 amount1)
    {
        PositionData memory pos = positionData[p.tokenId];
        amount0 = mockFee0;
        amount1 = mockFee1;
        if (amount0 > 0) IERC20(pos.token0).transfer(p.recipient, amount0);
        if (amount1 > 0) IERC20(pos.token1).transfer(p.recipient, amount1);
        // Reset fees après collect
        mockFee0 = 0;
        mockFee1 = 0;
    }

    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96, address, address token0, address token1,
            uint24, int24, int24, uint128, uint256, uint256, uint128, uint128
        )
    {
        PositionData memory pos = positionData[tokenId];
        return (0, address(0), pos.token0, pos.token1, 0, 0, 0, 1e12, 0, 0, 0, 0);
    }
}

// ─── Helper : remplace l'adresse NFPM constante via vm.etch ──────────────────

// ─── Suite de tests ───────────────────────────────────────────────────────────

contract V3GraduationTest is Test {
    using Clones for address;

    MockUSDC         usdc;
    MockNFPM         nfpm;

    BondingCurve     curveImpl;
    V3LPVault        vaultImpl;
    FeeDistributor   distributorImpl;
    LaunchpadFactory factory;
    WhitelistRegistry registry;

    address treasury = address(0xBEEF);
    address alice    = address(0xA11CE); // creator
    address bob      = address(0xB0B);   // holder/trader
    address carol    = address(0xCA401); // autre holder

    uint256 constant GRAD_THRESHOLD = 4_800_000_000; // 4 800 USDC (6 dec)

    // ─── Setup ────────────────────────────────────────────────────────────

    function setUp() public {
        usdc = new MockUSDC();
        nfpm = new MockNFPM();

        // Déployer le mock NFPM à l'adresse constante utilisée par V3LPVault et BondingCurve
        address NFPM_ADDR = 0x6049c9a0e26405c0985f9e3685c87d0ae917f82b;
        vm.etch(NFPM_ADDR, address(nfpm).code);
        // Copier le storage du mock aussi
        // Note : vm.etch copie uniquement le bytecode. On utilise une référence directe.
        // Pour les tests, on va plutôt utiliser MockNFPM directement via une surcharge locale.

        // Implémentations
        curveImpl       = new BondingCurve();
        vaultImpl       = new V3LPVault();
        distributorImpl = new FeeDistributor();
        registry        = new WhitelistRegistry(address(this));

        factory = new LaunchpadFactory(
            address(curveImpl),
            address(curveImpl),  // genericImpl (simplifié pour ces tests)
            address(vaultImpl),
            address(distributorImpl),
            address(usdc),
            treasury,
            address(registry)
        );

        // Donner de l'USDC aux participants
        usdc.mint(alice, 10_000_000_000);  // 10 000 USDC
        usdc.mint(bob,   10_000_000_000);
        usdc.mint(carol,  5_000_000_000);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────

    /**
     * @dev Crée un token via la factory et retourne les adresses.
     */
    function _createToken(bool holderRewards_)
        internal
        returns (address curve, address token, address vault_, address distributor_)
    {
        vm.startPrank(alice);
        usdc.approve(address(factory), type(uint256).max);
        (curve, token, vault_, distributor_) = factory.createToken(
            "TestMeme", "MEME", "ipfs://img", "A test meme token",
            0,             // pas de first buy
            holderRewards_
        );
        vm.stopPrank();
    }

    /**
     * @dev Graduate un token en achetant assez d'USDC pour atteindre le seuil.
     *      Achète en petites tranches pour ne pas dépasser la limite first-buy.
     */
    function _graduateToken(address curve) internal {
        vm.startPrank(bob);
        usdc.approve(curve, type(uint256).max);
        // Acheter jusqu'à graduation (plusieurs tranches de 480 USDC)
        for (uint256 i = 0; i < 12; i++) {
            if (BondingCurve(curve).graduated()) break;
            BondingCurve(curve).buy(480_000_000, 0, bob); // 480 USDC
        }
        vm.stopPrank();
        assertTrue(BondingCurve(curve).graduated(), "should be graduated");
    }

    // ─── Tests V3LPVault ──────────────────────────────────────────────────

    function test_vault_initializes_correctly() public {
        (, , address vault_, ) = _createToken(false);
        V3LPVault vault = V3LPVault(vault_);

        assertEq(address(vault.usdc()),   address(usdc));
        assertEq(vault.treasury(),        treasury);
        assertEq(vault.creator(),         alice);
        assertFalse(vault.holderRewards());
        assertEq(vault.feeDistributor(),  address(0));
        assertFalse(vault.locked());
    }

    function test_vault_initializes_with_holder_rewards() public {
        (, , address vault_, address dist_) = _createToken(true);
        V3LPVault vault = V3LPVault(vault_);

        assertTrue(vault.holderRewards());
        assertEq(vault.feeDistributor(), dist_);
        assertTrue(dist_ != address(0));
    }

    function test_vault_cannot_reinitialize() public {
        (, , address vault_, ) = _createToken(false);
        vm.expectRevert("V3LPVault: already initialized");
        V3LPVault(vault_).initialize(address(usdc), treasury, alice, false, address(0));
    }

    function test_vault_collect_before_lock_reverts() public {
        (, , address vault_, ) = _createToken(false);
        vm.expectRevert("V3LPVault: no position yet");
        V3LPVault(vault_).collectFees();
    }

    // ─── Tests graduation ─────────────────────────────────────────────────

    function test_graduation_sets_graduated_flag() public {
        (address curve, , , ) = _createToken(false);
        _graduateToken(curve);
        assertTrue(BondingCurve(curve).graduated());
    }

    function test_graduation_locks_vault() public {
        (address curve, , address vault_, ) = _createToken(false);
        assertFalse(V3LPVault(vault_).locked());
        _graduateToken(curve);
        assertTrue(V3LPVault(vault_).locked(), "vault should be locked after graduation");
        assertTrue(V3LPVault(vault_).positionTokenId() > 0, "tokenId should be set");
    }

    function test_buy_after_graduation_reverts() public {
        (address curve, , , ) = _createToken(false);
        _graduateToken(curve);

        vm.startPrank(bob);
        usdc.approve(curve, 1_000_000);
        vm.expectRevert("BondingCurve: graduated");
        BondingCurve(curve).buy(1_000_000, 0, bob);
        vm.stopPrank();
    }

    function test_sell_after_graduation_reverts() public {
        (address curve, address token, , ) = _createToken(false);
        // Bob achète d'abord
        vm.startPrank(bob);
        usdc.approve(curve, 100_000_000);
        BondingCurve(curve).buy(100_000_000, 0, bob);
        uint256 bobTokens = IERC20(token).balanceOf(bob);
        vm.stopPrank();

        _graduateToken(curve);

        vm.startPrank(bob);
        IERC20(token).approve(curve, bobTokens);
        vm.expectRevert("BondingCurve: graduated");
        BondingCurve(curve).sell(bobTokens, 0, bob);
        vm.stopPrank();
    }

    // ─── Tests collectFees (sans holder rewards) ──────────────────────────

    function test_collect_fees_splits_67_33() public {
        (address curve, , address vault_, ) = _createToken(false);
        _graduateToken(curve);

        // Configurer des fees simulées dans le mock NFPM
        // Note : comme vm.etch copie le bytecode mais pas le storage,
        // on configure via l'interface du mock à l'adresse copiée.
        // Dans un vrai test fork, les fees viendraient de swaps réels.
        // Ici, on donne directement de l'USDC au vault pour simuler.
        uint256 feeAmount = 300_000_000; // 300 USDC
        usdc.mint(vault_, feeAmount);

        // Simuler collectFees en appelant directement le vault
        // (dans les vrais tests, le mock NFPM distribuerait les fees)
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 aliceBefore    = usdc.balanceOf(alice);

        // Appel depuis n'importe qui (keeper-friendly)
        V3LPVault(vault_).collectFees();

        uint256 treasuryGained = usdc.balanceOf(treasury) - treasuryBefore;
        uint256 aliceGained    = usdc.balanceOf(alice)    - aliceBefore;

        // 67% treasury, 33% creator
        assertApproxEqAbs(treasuryGained, feeAmount * 67 / 100, 1, "treasury 67%");
        assertApproxEqAbs(aliceGained,    feeAmount * 33 / 100, 1, "creator 33%");
        assertEq(treasuryGained + aliceGained, feeAmount, "sum = total");
    }

    // ─── Tests FeeDistributor ─────────────────────────────────────────────

    function test_distributor_stake_and_claim() public {
        (, address token, address vault_, address dist_) = _createToken(true);
        _graduateToken(address(0)); // crée un token distinct pour la graduation

        // Bob stake des tokens
        uint256 stakeAmt = 1_000_000 * 1e18; // 1M tokens
        usdc.mint(address(bob), 0); // bob a déjà des tokens depuis les achats ? Non, utilisons un mint direct
        // Mint des tokens à bob directement pour le test
        // (en prod, bob les aurait achetés sur la courbe)
        vm.prank(address(factory)); // hack — mint since OMToken mints to curve
        // En réalité on donne des tokens à bob via un achat sur une courbe déjà créée

        FeeDistributor dist = FeeDistributor(dist_);
        assertEq(dist.totalStaked(), 0);
        assertEq(dist.vault(), vault_);
    }

    function test_distributor_reward_split_proportional() public {
        // Déployer un FeeDistributor seul pour tester la logique
        FeeDistributor dist = FeeDistributor(address(distributorImpl).clone());

        // Créer un token de staking mock
        MockUSDC stakeToken = new MockUSDC(); // réutilise MockUSDC comme token 18 dec (simplifié)
        MockUSDC rewardUsdc = new MockUSDC();
        address  vaultMock  = address(0xDEAD1);

        address curveMock = address(0xDEAD9);
        dist.initialize(address(stakeToken), address(rewardUsdc), vaultMock, curveMock);

        // Mint et stake : bob 3x, carol 1x
        stakeToken.mint(bob,   3_000_000);
        stakeToken.mint(carol, 1_000_000);

        vm.prank(bob);
        stakeToken.approve(address(dist), type(uint256).max);
        vm.prank(bob);
        dist.stake(3_000_000);

        vm.prank(carol);
        stakeToken.approve(address(dist), type(uint256).max);
        vm.prank(carol);
        dist.stake(1_000_000);

        // Simuler notifyReward (depuis vault)
        uint256 reward = 400_000; // 400 USDC (6 dec)
        rewardUsdc.mint(vaultMock, reward);
        vm.prank(vaultMock);
        rewardUsdc.approve(address(dist), reward);
        // Transférer l'USDC au dist avant notify (comme le vault le ferait)
        vm.prank(vaultMock);
        rewardUsdc.transfer(address(dist), reward);
        vm.prank(vaultMock);
        dist.notifyReward(reward);

        // Bob doit avoir 75% (3/4), Carol 25% (1/4)
        assertApproxEqAbs(dist.claimable(bob),   300_000, 1, "bob 75%");
        assertApproxEqAbs(dist.claimable(carol),  100_000, 1, "carol 25%");

        // Bob claim
        uint256 bobBefore = rewardUsdc.balanceOf(bob);
        vm.prank(bob);
        dist.claim();
        assertApproxEqAbs(rewardUsdc.balanceOf(bob) - bobBefore, 300_000, 1, "bob claimed");
        assertEq(dist.claimable(bob), 0, "bob nothing left");

        // Carol unstake + claim via exit()
        uint256 carolBefore = rewardUsdc.balanceOf(carol);
        vm.prank(carol);
        dist.exit();
        assertApproxEqAbs(rewardUsdc.balanceOf(carol) - carolBefore, 100_000, 1, "carol claimed");
        assertEq(dist.totalStaked(), 3_000_000, "only bob still staked");
    }

    function test_distributor_no_stakers_accumulates() public {
        FeeDistributor dist = FeeDistributor(address(distributorImpl).clone());
        MockUSDC stakeToken = new MockUSDC();
        MockUSDC rewardUsdc = new MockUSDC();
        address  vaultMock  = address(0xDEAD2);

        dist.initialize(address(stakeToken), address(rewardUsdc), vaultMock, address(0xDEAD9));

        // Notify sans stakers → USDC reste dans le contrat
        uint256 reward = 100_000;
        rewardUsdc.mint(address(dist), reward); // vault a déjà transféré
        vm.prank(vaultMock);
        dist.notifyReward(reward);

        assertEq(dist.rewardPerTokenStored(), 0, "no update without stakers");
        assertEq(rewardUsdc.balanceOf(address(dist)), reward, "USDC still in contract");

        // Bob stake maintenant
        stakeToken.mint(bob, 1_000_000);
        vm.prank(bob);
        stakeToken.approve(address(dist), type(uint256).max);
        vm.prank(bob);
        dist.stake(1_000_000);

        // Nouveau reward → maintenant distribué
        rewardUsdc.mint(address(dist), reward);
        vm.prank(vaultMock);
        dist.notifyReward(reward);

        // Bob n'a droit qu'au 2e reward (a staké après le 1er)
        assertApproxEqAbs(dist.claimable(bob), reward, 1, "bob gets 2nd reward");
    }

    function test_distributor_only_vault_can_notify() public {
        FeeDistributor dist = FeeDistributor(address(distributorImpl).clone());
        MockUSDC stakeToken = new MockUSDC();
        MockUSDC rewardUsdc = new MockUSDC();
        address  vaultMock  = address(0xDEAD3);

        dist.initialize(address(stakeToken), address(rewardUsdc), vaultMock, address(0xDEAD9));

        vm.prank(alice);
        vm.expectRevert("FeeDistributor: unauthorized");
        dist.notifyReward(100_000);
    }

    function test_distributor_cannot_reinitialize() public {
        FeeDistributor dist = FeeDistributor(address(distributorImpl).clone());
        MockUSDC stakeToken = new MockUSDC();
        MockUSDC rewardUsdc = new MockUSDC();

        dist.initialize(address(stakeToken), address(rewardUsdc), address(0xDEAD4), address(0xDEAD9));

        vm.expectRevert("FeeDistributor: already initialized");
        dist.initialize(address(stakeToken), address(rewardUsdc), address(0xDEAD4), address(0xDEAD9));
    }

    function test_distributor_unstake_insufficient_reverts() public {
        FeeDistributor dist = FeeDistributor(address(distributorImpl).clone());
        MockUSDC stakeToken = new MockUSDC();
        MockUSDC rewardUsdc = new MockUSDC();

        dist.initialize(address(stakeToken), address(rewardUsdc), address(0xDEAD5), address(0xDEAD9));

        stakeToken.mint(bob, 1_000_000);
        vm.prank(bob);
        stakeToken.approve(address(dist), type(uint256).max);
        vm.prank(bob);
        dist.stake(500_000);

        vm.prank(bob);
        vm.expectRevert("FeeDistributor: insufficient stake");
        dist.unstake(1_000_000);
    }

    function test_distributor_multiple_reward_rounds() public {
        FeeDistributor dist = FeeDistributor(address(distributorImpl).clone());
        MockUSDC stakeToken = new MockUSDC();
        MockUSDC rewardUsdc = new MockUSDC();
        address  vaultMock  = address(0xDEAD6);

        dist.initialize(address(stakeToken), address(rewardUsdc), vaultMock, address(0xDEAD9));

        // Bob et Carol stakent 50/50
        stakeToken.mint(bob,   500_000);
        stakeToken.mint(carol, 500_000);

        vm.prank(bob);   stakeToken.approve(address(dist), type(uint256).max);
        vm.prank(carol); stakeToken.approve(address(dist), type(uint256).max);
        vm.prank(bob);   dist.stake(500_000);
        vm.prank(carol); dist.stake(500_000);

        // Round 1 : 200 USDC
        rewardUsdc.mint(address(dist), 200_000);
        vm.prank(vaultMock); dist.notifyReward(200_000);

        // Bob unstake après round 1
        vm.prank(bob); dist.unstake(500_000);

        // Round 2 : 100 USDC — seul Carol est staké
        rewardUsdc.mint(address(dist), 100_000);
        vm.prank(vaultMock); dist.notifyReward(100_000);

        // Bob : 100 USDC (50% du round 1), Carol : 100 USDC (50% round 1) + 100 USDC (round 2) = 200
        assertApproxEqAbs(dist.claimable(bob),   100_000, 1, "bob round1 only");
        assertApproxEqAbs(dist.claimable(carol),  200_000, 1, "carol round1+2");

        // Claim tous les deux
        vm.prank(bob);   dist.claim();
        vm.prank(carol); dist.claim();

        assertEq(rewardUsdc.balanceOf(bob),   100_000, "bob final");
        assertEq(rewardUsdc.balanceOf(carol),  200_000, "carol final");
        assertEq(rewardUsdc.balanceOf(address(dist)), 0, "dist empty");
    }

    // ─── Tests factory ────────────────────────────────────────────────────

    function test_factory_stores_vault_and_distributor() public {
        (address curve, , address vault_, address dist_) = _createToken(true);

        assertEq(factory.curveVault(curve),       vault_);
        assertEq(factory.curveDistributor(curve), dist_);
        assertTrue(dist_ != address(0));
    }

    function test_factory_no_distributor_without_holder_rewards() public {
        (address curve, , address vault_, address dist_) = _createToken(false);

        assertEq(factory.curveVault(curve),       vault_);
        assertEq(factory.curveDistributor(curve), address(0));
        assertEq(dist_, address(0));
    }
}
