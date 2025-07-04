import { EventEmitter } from "events";
import { BrowserProvider, Contract, toNumber, toBeHex } from "ethers";
import detectEthereumProvider from "@metamask/detect-provider";

class EthersWalletAdapter extends EventEmitter {
    #isSetup = false;
    #needsNetData;
    #needsNetsData;
    #needsWalletAddress;
    #isInitalized = false;
    #provider;
    #webProvider;
    #signer;
    #account;
    #currentChainId;
    #signerContract = {};
    #providerContract = {};
    #addEventTimeout = null;
    account = () => this.#account ?? undefined;
    provider = () => this.#webProvider;
    signer = () => this.#signer;
    currentChainId = () => this.#currentChainId;
    isCorrectNet = () =>
        this.#currentChainId === (this.#needsNetData?.chain_id ?? 0);
    isWalletConnected = () =>
        !(this.#account === null || this.#account === undefined);

    #formatNetData(arrayNetworks) {
        const formatNetwork = (network) => {
            return {
                chain_id: network.chain_id,
                chain_name: network.chain_name,
                rpc_url: [network.rpc_url],
                native_currency: {
                    name: network.currency_name,
                    symbol: network.currency_symbol,
                    decimals: network.currency_decimals ?? 18,
                },
                block_explorer_urls: network.block_explorer_url
                    ? [network.block_explorer_url]
                    : undefined,
            };
        };
        if (!Array.isArray(arrayNetworks)) {
            return [formatNetwork(arrayNetworks)];
        } else {
            return arrayNetworks.map((network) => formatNetwork(network));
        }
    }
    setup(needsNetsData, initChainId = null, needsWalletAddress = null) {
        this.destroy();
        this.#needsNetsData = this.#formatNetData(needsNetsData);
        this.#needsNetData = initChainId
            ? this.#needsNetsData.find(
                  (network) => network.chain_id === initChainId
              )
            : this.#needsNetsData[0];
        this.#needsWalletAddress = needsWalletAddress;
        this.#currentChainId = this.#needsNetData?.chain_id;
        this.#isSetup = true;

        return this;
    }

    async #addNetwork() {
        try {
            const params = [
                {
                    chainId: toBeHex(this.#needsNetData.chain_id),
                    chainName: this.#needsNetData.chain_name,
                    rpcUrls: [...this.#needsNetData.rpc_url],
                    nativeCurrency: {
                        name: this.#needsNetData.native_currency.name,
                        symbol: this.#needsNetData.native_currency.symbol,
                        decimals:
                            this.#needsNetData.native_currency.decimals ?? 18,
                    },
                    blockExplorerUrls:
                        [...this.#needsNetData.block_explorer_urls] ?? [],
                },
            ];
            await this.#webProvider.request({
                method: "wallet_addEthereumChain",
                params,
            });
            this.changeNetwork(this.#needsNetData.chain_id);
        } catch (e) {
            this.#needsNetData = this.#needsNetsData.find(
                (network) => network.chain_id === this.#currentChainId
            );
            this.disconnectWallet();
            if (e.code !== -32603) {
                //unknown error, just bypass this error
                this.emit("failedToAddNetwork", this.#currentChainId);
                return false;
            }
            this.emit("failedToAddNetwork", this.#currentChainId);
        }
    }

    async #getChainId() {
        const chainId = await this.#webProvider.request({
            method: "eth_chainId",
        });
        return toNumber(chainId);
    }

    async changeNetwork(chainId) {
        try {
            const currentChainId = await this.#getChainId();
            if (currentChainId === chainId) {
                return;
            }

            this.#needsNetData = this.#needsNetsData.find(
                (network) => network.chain_id === chainId
            );
            await this.#webProvider.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: toBeHex(chainId) }],
            });

            let accounts = await this.#getCurrentAccounts();
            if (!Array.isArray(accounts)) accounts = [];
            if (accounts.length > 0) {
                this.#account = accounts[0];
                this.emit("walletConnected", this.#account);
            }
            this.#currentChainId = chainId;
        } catch (error) {
            if (error && error.code === 4902) {
                await this.#addNetwork();
            }
            this.emit("failedToChangeNetwork", chainId);
        }
    }

    async init(autoConnect = true) {
        if (!this.#isSetup) {
            this.#error("You should setup EthersWalletAdapter first.");
        }

        if (this.#isInitalized) {
            this.#error("EthersWalletAdapter is already initialized.");
        }

        if (typeof autoConnect === "function") {
            autoConnect = autoConnect();
        }

        this.#checkShouldNetworkDataIsCorrect();

        this.#webProvider = window.ethereum ?? (await detectEthereumProvider());

        if (this.#webProvider) {
            this.#provider = new BrowserProvider(this.#webProvider);

            await this.changeNetwork(this.#needsNetData.chain_id);

            this.#isInitalized = true;
            this.emit("walletConnectorInitialized");

            if (autoConnect) await this.connectWallet();

            if (this.#addEventTimeout) {
                clearTimeout(this.#addEventTimeout);
                this.#addEventTimeout = null;
            }
            this.#addEventTimeout = setTimeout(() => {
                this.#webProvider.on("chainChanged", async () => {
                    this.emit("networkSwitched", this.#needsNetData);
                });
                this.#webProvider.on("accountsChanged", async (accounts) => {
                    if (accounts.length > 0) {
                        this.#account = accounts[0];
                        this.emit("accountsChanged", this.#account);
                    } else {
                        this.#account = undefined;
                        this.emit("walletDisconnected", this.#currentChainId);
                    }
                });
            }, 1000);
        } else {
            this.emit("walletProviderNotFound");
            this.#error("Wallet provider not found.");
        }
    }

    destroy() {
        this.removeAllListeners();
        this.#webProvider?.removeAllListeners();
        this.#isSetup = false;
        this.#needsNetData = undefined;
        this.#needsWalletAddress = undefined;
        this.#isInitalized = false;
        this.#provider = undefined;
        this.#webProvider = undefined;
        this.#signer = undefined;
        this.#account = undefined;
        this.#currentChainId = undefined;
        this.#signerContract = {};
        this.#providerContract = {};

        return this;
    }

    async #requestConnect() {
        try {
            await this.#webProvider.request({
                method: "wallet_requestPermissions",
                params: [
                    {
                        eth_accounts: {},
                    },
                ],
            });

            return true;
        } catch (e) {
            return false;
        }
    }

    async switchWallet() {
        await this.#requestConnect();
    }

    async connectWallet(forceNewConnect = false) {
        if (!this.#checkIfAllowed()) return undefined;

        const currentChainId = await this.#getChainId();
        if (currentChainId !== this.#needsNetData.chain_id) {
            await this.changeNetwork(this.#needsNetData.chain_id);
            return false;
        }

        if (typeof forceNewConnect === "function") {
            forceNewConnect = forceNewConnect();
        }

        if (forceNewConnect) {
            const connected = await this.#requestConnect();

            if (!connected) {
                this.emit("failedToConnectWallet");
                return undefined;
            }
        }

        let accounts = await this.#getCurrentAccounts();
        if (!Array.isArray(accounts)) accounts = [];

        let tryConnectCount = 0;

        const reconnect = async (
            failEventName = "failedToConnectWallet",
            ...failEventArgs
        ) => {
            if (tryConnectCount > 0) {
                let shouldRetry = true;

                if (tryConnectCount > 3) shouldRetry = false;

                if (!shouldRetry) {
                    this.emit(failEventName, ...failEventArgs);
                    accounts = null;
                    return false;
                }
            }

            if (!(await this.#requestConnect())) {
                this.emit("failedToConnectWallet");
                accounts = null;
                return false;
            }

            accounts = await this.#getCurrentAccounts();
            tryConnectCount++;

            return true;
        };

        if (this.#needsWalletAddress !== null) {
            while (
                !accounts
                    .map((account) => account.toUpperCase())
                    .includes(this.#needsWalletAddress.toUpperCase())
            ) {
                if (
                    !(await reconnect(
                        "invalidWallet",
                        this.#needsWalletAddress
                    ))
                )
                    break;
            }
        } else {
            while (accounts.length <= 0) {
                if (!(await reconnect())) break;
            }
        }

        if (accounts !== null) {
            const account_index =
                this.#needsWalletAddress !== null
                    ? accounts
                          .map((account) => account.toUpperCase())
                          .indexOf(this.#needsWalletAddress.toUpperCase())
                    : 0;
            this.#account = accounts[account_index];
            // this.#signer = await this.#provider.getSigner(this.#account);
            this.emit("walletConnected", this.#account);
        }

        return this.#account;
    }

    async disconnectWallet() {
        if (!this.#checkIfAllowed()) return;

        if (this.isWalletConnected()) {
            try {
                await this.#webProvider.request({
                    method: "wallet_revokePermissions",
                    params: [
                        {
                            eth_accounts: {},
                        },
                    ],
                });

                this.#account = undefined;

                this.emit("walletDisconnected", this.#currentChainId);
            } catch (e) {
                return false;
            }
        }
    }

    async getBalance(
        address = this.#account,
        blockTag = "latest",
        onError = null
    ) {
        if (!this.#checkIfAllowed()) return;
        if (!this.isWalletConnected()) {
            await this.connectWallet();
        }
        if (!address) {
            this.#error("Address is required to get balance.");
        }
        try {
            const balance = await this.#provider.getBalance(address, blockTag);
            return balance;
        } catch (e) {
            if (typeof onError === "function") {
                return onError(e) ?? null;
            }
        }
        return null;
    }

    async contract(contractAddress, ABI) {
        if (!this.#checkIfAllowed()) return;

        if (!this.isWalletConnected()) {
            await this.connectWallet();
        }

        let contractCaller = (this.#providerContract[contractAddress] ??=
            new Contract(contractAddress, ABI, this.#provider));
        let contractSigner = (this.#signerContract[contractAddress] ??=
            new Contract(contractAddress, ABI, this.#signer));

        return new (function () {
            this.call = async function (
                methodName,
                methodParams = [],
                callParams = {},
                onError = null
            ) {
                try {
                    return await contractCaller[methodName](
                        ...methodParams,
                        callParams
                    );
                } catch (e) {
                    if (typeof onError === "function")
                        return onError(e) ?? null;
                    // else console.log(e); //TODO: should erase this on production
                }

                return null;
            };

            this.signedCall = async function (
                methodName,
                methodParams = [],
                callParams = {},
                onError = null
            ) {
                try {
                    return await contractSigner[methodName](
                        ...methodParams,
                        callParams
                    );
                } catch (e) {
                    if (typeof onError === "function")
                        return onError(e) ?? null;
                    // else console.log(e); //TODO: should erase this on production
                }

                return null;
            };

            this.send = async function (
                methodName,
                methodParams = [],
                sendParams = {}
            ) {
                try {
                    const txn = await contractSigner[methodName](
                        ...methodParams,
                        sendParams
                    );

                    return {
                        success: true,
                        data: txn,
                        waitForFinish: async function () {
                            try {
                                const receipt = await txn.wait();

                                return {
                                    success: true,
                                    data: receipt,
                                };
                            } catch (e) {
                                return {
                                    success: false,
                                    error: e?.info?.error ?? e?.innerError ?? e,
                                };
                            }
                        },
                    };
                } catch (e) {
                    return {
                        success: false,
                        error: e?.info?.error ?? e?.innerError ?? e,
                    };
                }
            };
        })();
    }

    async #getCurrentAccounts() {
        try {
            return await this.#webProvider.request({
                method: "eth_accounts",
                params: [],
            });
        } catch (e) {
            return [];
        }
    }

    #checkShouldNetworkDataIsCorrect() {
        if (this.#needsNetData === undefined || this.#needsNetData === null) {
            this.#error(
                "You should initialize EthersWalletAdapter with chainData in first parameter."
            );
        }

        const requiredOptions = [
            "chain_id",
            "chain_name",
            "native_currency",
            "rpc_url",
        ];
        requiredOptions.forEach((option) => {
            if (this.#needsNetData[option] === undefined)
                this.#error(
                    `'${option}' option is required in 'needsNetData'.`
                );
        });
    }

    #checkIfAllowed() {
        if (!this.#webProvider) {
            this.emit("walletProviderNotFound");
            this.#error("Wallet provider not found.");
            return false;
        }

        return true;
    }

    #error(message) {
        throw `ERROR - EthersWalletAdapter: ${message}`;
    }
}

export default new EthersWalletAdapter();
