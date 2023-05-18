const { network, getNamedAccounts, deployments, ethers } = require('hardhat');
const { developmentChain } = require('../../helper-hardhat-config');
const { assert, expect } = require('chai');
const { networkConfig } = require('../../helper-hardhat-config');

!developmentChain.includes(network.name)
  ? describe.skip
  : describe('Raffle', () => {
      let raffle, vrfCoordinatorV2Mock, entranceFee, interval;
      const chainId = network.config.chainId;

      beforeEach(async () => {
        // get deployer
        deployer = (await getNamedAccounts()).deployer;
        // deploy everything
        await deployments.fixture(['all']);
        // connect deployed contracts with deployer
        raffle = await ethers.getContract('Raffle', deployer);
        vrfCoordinatorV2Mock = await ethers.getContract('VRFCoordinatorV2Mock', deployer);
        entranceFee = await raffle.getEntranceFee();
        interval = await raffle.getInterval();
      });

      // constructor testing
      describe('constructor', () => {
        it('initializes the raffle properly', async () => {
          // Ideally we make our tests have just 1 assert per "it"
          const raffleState = await raffle.getRaffleState();
          assert.equal(raffleState.toString(), '0');
          assert.equal(interval.toString(), networkConfig[chainId]['interval']);
        });
      });

      // enter raffle test
      describe('enter raffle', () => {
        it('revert if minimum entrance fee is not provided', async () => {
          await expect(raffle.enterRaffle()).to.be.revertedWith('Raffle__NotEnoughETHEntered');
        });
        it('records players in players array when they enter', async () => {
          // Entering game
          await raffle.enterRaffle({ value: entranceFee });
          const firstFunder = await raffle.getPlayer(0);
          assert.equal(firstFunder, deployer);
        });
        it('emits event on enter', async () => {
          await expect(raffle.enterRaffle({ value: entranceFee })).to.emit(raffle, 'RaffleEnter');
        });

        it('revert if rafflestate is not open', async () => {
          // We need to set that checkUpkeep func returns true
          await raffle.enterRaffle({ value: entranceFee });
          // We are increasing time, so that we don't need to wait for our interval to pass
          await network.provider.send('evm_increaseTime', [interval.toNumber() + 1]);
          // Mining one block
          await network.provider.request({ method: 'evm_mine', params: [] });
          // Now after checkupkeep returns true we can
          // pretend to be chainlink keeper and call performmupkeep
          await raffle.performUpkeep([]);
          // performupkeep will change the raffle state from open to calculating
          await expect(raffle.enterRaffle({ value: entranceFee })).to.be.revertedWith(
            'Raffle__NotOpen'
          );
        });
      });

      // checkupkeep test
      describe('checkUpkeep', () => {
        it("returns false if people haven't sent any ETH", async () => {
          await network.provider.send('evm_increaseTime', [interval.toNumber() + 1]);
          await network.provider.request({ method: 'evm_mine', params: [] });
          // We are simulating func call with keyword callStatic
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep('0x');
          assert(!upkeepNeeded);
        });
        it("returns false if raffle isn't open", async () => {
          await raffle.enterRaffle({ value: entranceFee });
          await network.provider.send('evm_increaseTime', [interval.toNumber() + 1]);
          await network.provider.request({ method: 'evm_mine', params: [] });
          // Calling perform upkeep => that will change raffleState = calculating
          await raffle.performUpkeep([]);
          // get the state
          const raffleState = await raffle.getRaffleState();
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep('0x');
          assert.equal(upkeepNeeded, false);
          assert.equal(raffleState.toString(), '1');
        });
        it("returns false if enough time hasn't pass", async () => {
          await raffle.enterRaffle({ value: entranceFee });
          await network.provider.send('evm_increaseTime', [interval.toNumber() - 1]);
          await network.provider.request({ method: 'evm_mine', params: [] });
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep('0x');
          assert.equal(!upkeepNeeded, false);
        });
        it('returns true if all params are true', async () => {
          await raffle.enterRaffle({ value: entranceFee });
          await network.provider.send('evm_increaseTime', [interval.toNumber() + 1]);
          await network.provider.request({ method: 'evm_mine', params: [] });
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep('0x');
          assert(upkeepNeeded);
        });
      });

      // PERFORM UPKEEP
      describe('performUpkeep', () => {
        it('it can only run if checkupkeep is true', async () => {
          await raffle.enterRaffle({ value: entranceFee });
          await network.provider.send('evm_increaseTime', [interval.toNumber() + 1]);
          await network.provider.request({ method: 'evm_mine', params: [] });
          const tx = await raffle.performUpkeep([]);
          assert(tx);
        });
        it('reverts when checkupkeep is false', async () => {
          await expect(raffle.performUpkeep([])).to.be.revertedWith('Raffle__UpkeepNotNeeded');
        });
        it('updates the raffle state, emits and event, and calls the vrf coordinator', async () => {
          await raffle.enterRaffle({ value: entranceFee });
          await network.provider.send('evm_increaseTime', [interval.toNumber() + 1]);
          await network.provider.request({ method: 'evm_mine', params: [] });
          const txResponse = await raffle.performUpkeep([]);
          const txReceipt = await txResponse.wait(1);
          // Grabbing request id from events
          const requestId = txReceipt.events[1].args.requestId;
          const raffleState = await raffle.getRaffleState();
          assert(requestId.toNumber() > 0);
          assert(raffleState.toString() == '1');
        });
      });

      // FULLFILL RANDOM WORDS
      describe('fullfillRandomWords', () => {
        beforeEach(async () => {
          await raffle.enterRaffle({ value: entranceFee });
          await network.provider.send('evm_increaseTime', [interval.toNumber() + 1]);
          await network.provider.request({ method: 'evm_mine', params: [] });
        });
        it('can only be called after performUpkeep', async () => {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
          ).to.be.revertedWith('nonexistent request');
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
          ).to.be.revertedWith('nonexistent request');
        });
        it('picks a winner, reset the lottery, and sends money', async () => {
          const additionalEntrants = 3;
          const startingAccountIndex = 1; // deployer = 0
          const accounts = await ethers.getSigners();
          // connecting 3 additional players to raffle
          for (let i = startingAccountIndex; i < startingAccountIndex + additionalEntrants; i++) {
            const accountConnectRaffle = await raffle.connect(accounts[i]);
            await accountConnectRaffle.enterRaffle({ value: entranceFee });
          }
          const startingTimeStamp = await raffle.getLatestTimeStamp();
          // performupkeep (mock being chainlink keepers)
          // fullfillrandomwords (mock being the chainlink vrf)
          // we will have to wait for the fulfillrandomwords to be called
          await new Promise(async (resolve, reject) => {
            raffle.once('WinnerPicked', async () => {
              console.log('Found the event');
              try {
                // IF everything goes well, we can make assertions
                const recentWinner = await raffle.getRecentWinner();
                console.log(recentWinner);
                console.log(accounts[0].address);
                console.log(accounts[1].address);
                console.log(accounts[2].address);
                console.log(accounts[3].address);
                const raffleState = await raffle.getRaffleState();
                const endingTimeStamp = await raffle.getLatestTimeStamp();
                const numPlayers = await raffle.getNumberOfPlayers();
                const winnerEndingBalance = await accounts[1].getBalance();
                assert.equal(numPlayers.toString(), '0');
                assert.equal(raffleState.toString(), '0');
                assert(endingTimeStamp > startingTimeStamp);
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(
                    entranceFee.mul(additionalEntrants).add(entranceFee).toString()
                  )
                );
              } catch (error) {
                reject(error);
              }
              resolve();
            });
            // Setting up the listener
            // firing event, and listener will pick it up, and resolve
            const tx = await raffle.performUpkeep([]);
            const txReceipt = await tx.wait(1);
            const winnerStartingBalance = await accounts[1].getBalance();
            // When fullfillrandomwords resolve it should emit event WInnerPicked
            await vrfCoordinatorV2Mock.fulfillRandomWords(
              txReceipt.events[1].args.requestId,
              raffle.address
            );
          });
        });
      });
    });
