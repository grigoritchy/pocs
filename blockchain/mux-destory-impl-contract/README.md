
# Description
An attacker can destroy LiquidityManager implementation contract, which can make LiquidityManager proxy contract is incapacitated.

```sol
contract LiquidityManager is Storage, AssetManager, DexWrapper, Admin, ExtensionProxy {
    receive() external payable {}

    /**
     * @notice Initialize the LiquidityManager.
     */
    function initialize(address vault_, address pool_) external initializer {
        __SafeOwnable_init();
        _vault = vault_;
        _pool = pool_;
        // 0 for placeHolder
        _dexSpotConfigs.push();
    }
```


LiquidityManager contract is initialized through calling initialize function of proxy with delegatecall by deployer. When calling initialize function of contract first time, msg.sender becomes the owner of contract. This initialized function is called pretty well when contracts is deployed with proxy's delegatecall on the proxy's storage side. But it does not on the implementation's storage side.  
If deployer does not initialize LiquidityManager implementation's contract, There is a chance an attacker can call initialize function of LiquidityManager implementation's contract because that implementation storage is never initialized before the attacker call initialize function.  

And i figured out that this bug affects all of LiquidityManager's implementation contract that already deployed in the each network.

Here is contract list that did not call initialize function.

```
MainNet: https://etherscan.io/address/0xc9296e12e2fe55605d9f6db5412eaa1938f0b404 
Arbitrum: https://arbiscan.io/address/0xcd5daf9cF3CCa8Ff41Effd74D9437C432b31C358 
Avalanche: https://snowtrace.io/address/0x9D4A8d7523a36f4a2E99870f1aFf232ded7e95Ae 
BNB Chain: https://bscscan.com/address/0x2dE35ab97d23aEFd2B0E38A17787298f41819391 
Fantom: https://ftmscan.com/address/0x9eA320d5b987e859D841e7624E5e845928bA2ADc
```

What happens if an attacker become the owner of LiquidityManager's implementation contract?

```sol
    function setDexWrapper(
        uint8 dexId,
        address adapter,
        bytes memory initialData
    ) external onlyOwner {
        require(dexId != 0 && dexId < _dexSpotConfigs.length, "LST"); // the asset is not LiSTed
        _dexAdapters[dexId].adapter = adapter;
        _dexAdapters[dexId].slippage = DEFAULT_SLIPPAGE;
        _initializeAdapter(dexId, initialData);
        emit SetDexAdapter(dexId, adapter, initialData);
    }

    function _initializeAdapter(uint8 dexId, bytes memory initialData) internal dexCall(dexId) {
        DexRegistration storage registration = _dexAdapters[dexId];
        require(registration.adapter != address(0), "ANS"); // adapter not set
        _delegateCall(
            registration.adapter,
            abi.encodeWithSelector(IDexAdapter.initializeAdapter.selector, initialData)
        );
        emit ClaimDexFees(dexId);
    }
```

setDexWrapper function can be called only for owner of the contract. And I am already owner of the contract thorugh initialize function call, i can call setDexWrapper. This function sets _dexAdapters[dexId].adapter variable as adapter argument. This _dexAdapters[dexId].adapter variable is used as delegatecall's target in the _initializeAdapter function.

This is a point that attacker can destroy LiquidityManager's implementation contract. If delegatecall's target is attacker's contract that contain code selfdestruct(), and sets _dexAdapters[dexId].adapter as attacker's contract address, when _delegateCall is called in the _initializeAdapter function, LiquidityManager's implementation contract will be destroyed.

# Impact
LiquidityManager contract handles all of dex, assets to get or set information that is used in the mux protocol as core part.

If LiquidityManager implementation contract is destroyed so it is incapacitated, all system in the mux protocol couldn't be work, which is one of critical problem in the business logic.

# References
https://forum.openzeppelin.com/t/security-advisory-initialize-uups-implementation-contracts/15301
https://medium.com/immunefi/harvest-finance-uninitialized-proxies-bug-fix-postmortem-ea5c0f7af96b
