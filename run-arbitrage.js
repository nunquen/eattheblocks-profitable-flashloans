require('dotenv').config();

const Web3 = require('web3');

const { ChainId, Token, TokenAmount, Pair, Fetcher } = require('@uniswap/sdk');

// Libraries to pull market data from Kyber every time a block is closed in the required network (in this case Etherium network)
const abis = require('./abis');
// Kyber addresses: importing mainnet object and renaming as "addresses"
const { mainnet: addresses } = require('./addresses');

// Creating an isntance of web3 that represents a connection to the block chain
const web3 = new Web3(
    new Web3.providers.WebsocketProvider(process.env.INFURA_WEBSOCKET_ENDPOINT)
);

// Connection to Kyber to connect with the smart contract
const kyber = new web3.eth.Contract(
    // kyberNetworkProxy is the Smart contract of Kyber we're going to interact with
    abis.kyber.kyberNetworkProxy,
    addresses.kyber.kyberNetworkProxy
    );

// Adjust this value to be high enough to not produce slipage in the market
const AMOUNT_ETH = 100;

// **********************************************************************************
// TODO: This static variable should be updated on each run
const RECENT_ETH_PRICE = 1707;
// **********************************************************************************

// The minimum unit of Ether is called “wei” where 1 ether = 1000000000000000000 wei
// When transforming to Wei the value must be set as a string because is to long for javascript to represent it as a number
const AMOUNT_ETH_WEI = web3.utils.toWei(AMOUNT_ETH.toString());
const AMOUNT_DAI_WEI = web3.utils.toWei((AMOUNT_ETH * RECENT_ETH_PRICE).toString());

// Must use an async function in order to deal with @uniswap/sdk framework
const init = async () => {

    // Let's instantiate the 2 tokens
    // Note: We use 'weth' or Wrapped Etherium as a ERC20 valid token for ETH
    const [dai, weth] = await Promise.all(
        [addresses.tokens.dai, addresses.tokens.weth].map(tokenAddress => (
            Fetcher.fetchTokenData(
                ChainId.MAINNET,
                tokenAddress
            )
        ))
    );
    
    // Fetching data from uniswap
    const daiWeth = await Fetcher.fetchPairData(
        dai,
        weth
    );

    // We'll check the blockchain to discover any oportunity.
    // It'll faster to only check the block header instead of reading the whole block
    // Subscribing to the Etherium Block Header web socket
    web3.eth.subscribe('newBlockHeaders')
        .on('data', async block => {
            console.log(`New block received. Block #${block.number}`);

            // Let's query Kyber
            const kyberResults = await Promise.all([
                // We're going to request to prices at the same time
                // Query #1: From Dai to Ether
                kyber
                    .methods
                    .getExpectedRate(
                        // Dai token
                        addresses.tokens.dai,
                        // Kyber bypass: Because ETH is not a token we can use this value
                        '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 
                        // Amount of Dai we want to sell
                        AMOUNT_DAI_WEI
                    )
                    // Execute this query.
                    // Note: this is a query and it'll nos cost us nothing
                    .call(),
                
                    // Query #2: From Dai to Ether
                kyber
                    .methods
                    .getExpectedRate(
                        '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
                        addresses.tokens.dai,
                        // Amount of Eth we want to sell
                        AMOUNT_ETH_WEI
                    )
                    // Execute this query.
                    // Note: this is a query and it'll nos cost us nothing
                    .call()
            ]);

            // Normalizing values
            // BUY ETH/DAI
            //  - Get real value dividing bye WEI const which is 10 ^ 18
            //  - Get the Eth value which is 1 / Dai value
            // SELL DAI/ETH
            //  - Get real value dividing bye WEI const which is 10 ^ 18
            const kyberRates = {
                buy: parseFloat(1 / (kyberResults[0].expectedRate / (10 ** 18))),
                sell: parseFloat( (kyberResults[1].expectedRate / (10 ** 18)) )
            };

            console.log('kyber ETH/DAI');
            console.log(kyberRates);

            const uniswapResult = await Promise.all([
                daiWeth.getOutputAmount(new TokenAmount(dai, AMOUNT_DAI_WEI)),
                daiWeth.getOutputAmount(new TokenAmount(weth, AMOUNT_ETH_WEI))
            ]);

            console.log(uniswapResult);
        })
        .on('error', error => {
            console.log(error);
        });
}

// Calling the async function to start the script
init();