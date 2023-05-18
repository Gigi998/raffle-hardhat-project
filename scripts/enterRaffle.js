const { ethers } = require('hardhat');

async function enterRaffle() {
  const raffle = await ethers.getContract('Raffle');
  const entranceFee = await raffle.getEntranceFee();
  await raffle.enterRaffle({ value: entranceFee });
  console.log('Entered');
}

enterRaffle()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
