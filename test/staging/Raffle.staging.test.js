const { network, getNamedAccounts, deployments, ethers } = require('hardhat');
const { developmentChain } = require('../../helper-hardhat-config');
const { assert, expect } = require('chai');
const { networkConfig } = require('../../helper-hardhat-config');

// ONly on testnets
developmentChain.includes(network.name)
  ? describe.skip
  : describe('Raffle', () => {
      let raffle, entranceFee;
      beforeEach(async () => {
        // get deployer
        deployer = (await getNamedAccounts()).deployer;
        // connect deployed contracts with deployer
        raffle = await ethers.getContract('Raffle', deployer);
        entranceFee = await raffle.getEntranceFee();
      });
      describe('fullfillRandomWords', async () => {
        it('works with live Chainlink keepers and Chainlink vrf, we get a random winner', async () => {
          // enter the raffle
          const startingTimeStamp = await raffle.getLatestTimeStamp();
          const accounts = await ethers.getSigners();

          // Listener is added
          await new Promise(async (resolve, reject) => {
            raffle.once('WinnerPicked', async () => {
              console.log('WinnerPicked event fired!');
              try {
                // Asserts
                const reccentWinner = await raffle.getRecentWinner();
                const raffleState = await raffle.getRaffleState();
                const winnerEndingBalance = await accounts[0].getBalance();
                const endingTimeStamp = await raffle.getLatestTimeStamp();
                await expect(raffle.getPlayer(0)).to.be.reverted;
                assert.equal(reccentWinner.toString(), accounts[0].address);
                // assert.equal(reccentWinner.toString(), deployer);
                assert.equal(raffleState.toString(), '0');
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(entranceFee).toString()
                );
                assert(endingTimeStamp > startingTimeStamp);
                resolve();
              } catch (error) {
                reject(error);
              }
            });
            console.log('Entering the raffle');
            const tx = await raffle.enterRaffle({ value: entranceFee });
            await tx.wait(1);
            console.log('Time to wait...');
            const winnerStartingBalance = await accounts[0].getBalance();
            // setup a listener before we enter the raffle
            // just in case the blockchain moves realy fast
          });
        });
      });
    });
