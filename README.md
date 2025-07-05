# Ethers Wallet Adapter

A standardized interface for seamless DApp wallet connectivity across EVM chains.

## Features

-   🔌 Easy wallet connection setup

## Documentation

-   [Installation](#installation)
-   [Quick Start](#quick-start)
-   [Configuration](#configuration)
    -   [Network Configuration](#network-configuration)
    -   [Wallet Address Validation](#wallet-address-validation)
    -   [Reconnect Callback](#reconnection-confirmation-callback)
    -   [Auto Connect](#automatic-connection-on-initialization)
    -   [Manual Connect](#manual-wallet-connection)
-   [Events](#events)
-   [Contract Interactions](#contract-interactions)
    -   [Call (Read)](#reading-contract-data-call)
    -   [Send (Write)](#send-transaction-send)
-   [Supported Wallet Providers](#supported-wallet-providers)
-   [Contributions](#support-me)

## Installation

```bash
npm install ethers-wallet-adapter
```

## Quick Start

```typescript
import EthersWalletAdapter from "ethers-wallet-adapter";

// Configure your network
const networks = [
    {
        name: "ethereum",
        chain_id: 11155111, // Chain ID of the network
        chain_name: "Sepolia", // Name of the network
        currency_name: "ETH", // Name of the native currency
        currency_symbol: "SepoliaETH", // Symbol of the native currency
        rpc_url: "https://rpc.sepolia.org", // RPC URL for the network
        block_explorer_url: "https://sepolia.etherscan.io", // Block explorer URL
    },
    {
        name: "binance",
        chain_id: 97,
        chain_name: "BNB Smart Chain Testnet",
        currency_name: "BNB",
        currency_symbol: "tBNB",
        rpc_url: "https://data-seed-prebsc-1-s3.bnbchain.org:8545",
        block_explorer_url: "https://testnet.bscscan.com",
    },
];
const currentChainId = 11155111;

// Setup a adapter
let walletAdapter = EthersWalletAdapter.setup(networks, currentChainId);

// Initialize the Adapter
walletAdapter.init(autoConnectAfterInit);
```

## Support me

If you find this package helps you, kindly support me by donating some BNB (BSC) to the address below.

```
0x1A960Bf5b50aC5b57D700F9d555F4b4Cc179367d
```

<img src="./docs/images/bnbaddress.jpg" width="240">

## License

The MIT License (MIT). Please see [License File](LICENSE) for more information.
