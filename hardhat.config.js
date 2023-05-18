require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-etherscan');
require('hardhat-deploy');
require('solidity-coverage');
require('hardhat-gas-reporter');
require('hardhat-contract-sizer');
require('dotenv').config();

const SEPOLIA_RPC_URL =
  process.env.SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/your-api-key';
const PRIVATE_KEY =
  process.env.PRIVATE_KEY || '0x11ee3108a03081fe260ecdc106554d09d9d1209bcafd46942b10e02943effc4a';
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';
const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY || '';

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      chainId: 31337,
      blockConfirmations: 1,
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: [PRIVATE_KEY],
      chainId: 11155111,
      blockConfirmations: 6,
    },
  },
  etherscan: {
    apiKey: {
      sepolia: ETHERSCAN_API_KEY,
    },
  },
  solidity: '0.8.18',
  gasReporter: {
    enabled: false,
    outputFile: 'gas-reporter.txt',
    noColors: true,
    currency: 'USD',
    // coinmarketcap: COINMARKETCAP_API_KEY,
    token: 'MATIC',
  },
  namedAccounts: {
    deployer: {
      // First account of the accounts array in networks
      default: 0,
      1: 0,
    },
    player: {
      default: 1,
    },
  },
  mocha: {
    timeout: 500000, // 500 seconds
  },
};
