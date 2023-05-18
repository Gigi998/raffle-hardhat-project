const { network, ethers } = require('hardhat');
const { developmentChain, networkConfig } = require('../helper-hardhat-config');
const { verify } = require('../utils/verify');

const VRF_SUB_FUND_AMOUNT = ethers.utils.parseEther('2');

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;

  let vrfCoordinatorV2Address;
  let subscriptionId;
  let vrfCoordinatorV2Mock;

  if (developmentChain.includes(network.name)) {
    vrfCoordinatorV2Mock = await ethers.getContract('VRFCoordinatorV2Mock');
    vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address;
    // Programatic subscription
    const transactionResponse = await vrfCoordinatorV2Mock.createSubscription();
    const transactionReceipt = await transactionResponse.wait(1);
    subscriptionId = transactionReceipt.events[0].args.subId;
    // Fund the subscription, usually you need the link token on a real network
    await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, VRF_SUB_FUND_AMOUNT);
  } else {
    vrfCoordinatorV2Address = networkConfig[chainId]['vrfCoordinatorV2'];
    subscriptionId = networkConfig[chainId]['subscriptionId'];
  }
  // args
  const entranceFee = networkConfig[chainId]['entranceFee'];
  const gasLane = networkConfig[chainId]['gasLane'];
  const callbackGasLimit = networkConfig[chainId]['callbackGasLimit'];
  const interval = networkConfig[chainId]['interval'];

  const arguments = [
    vrfCoordinatorV2Address,
    entranceFee,
    gasLane,
    subscriptionId,
    callbackGasLimit,
    interval,
  ];

  // Deployment
  const raffle = await deploy('Raffle', {
    from: deployer,
    args: arguments,
    log: true,
    waitConfirmations: network.config.blockConfirmations || 1,
  });
  // Verification
  if (!developmentChain.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
    log('Verifying...');
    await verify(raffle.address, arguments);
  }

  // Adding consumer so that we can make tests
  if (developmentChain.includes(network.name)) {
    await vrfCoordinatorV2Mock.addConsumer(subscriptionId, raffle.address);
    log('consumer is added');
  }

  log('--------------------------------');
};

module.exports.tags = ['all', 'raffle'];
