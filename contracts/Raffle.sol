// Raffle
// Enter the lottery (paying some amount)
// Pick a radnom winner (verifiably random)
// Winner to be selected every X minutes -> completely automate
// Chainlink Oracle -> Randomness, Automated Execution (Chainlink Keepers)

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import '@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol';
import '@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol';
import '@chainlink/contracts/src/v0.8/interfaces/AutomationCompatibleInterface.sol';

// Error
error Raffle__NotEnoughETHEntered();
error Raffle__TransferFailed();
error Raffle__NotOpen();
error Raffle__UpkeepNotNeeded(uint256 currentBalance, uint256 numPlayers, uint256 raffleState);

/**@title A sample Raffle Contract
 * @author Luigi Drnasin
 * @notice This contract is for creating a sample raffle contract
 * @dev This implements the Chainlink VRF Version 2
 */

contract Raffle is VRFConsumerBaseV2, AutomationCompatibleInterface {
  // Typde declarations
  enum RaffleState {
    OPEN,
    CALCULATING
  } // uint256 0 = open, 1 = calculating

  // State variables
  VRFCoordinatorV2Interface private i_vrfCoordinator; // Fullfill random words
  uint256 private immutable i_entranceFee;
  address payable[] private s_players;
  bytes32 private immutable i_gasLane;
  uint64 private immutable i_subscriptionId;
  uint32 private immutable i_callbackGasLimit;
  uint16 private constant REQUEST_CONFIRMATION = 3;
  uint32 private constant NUM_WORDS = 1;

  // Lottery variables
  address private s_recentWinner;
  RaffleState private s_raffleState;
  uint256 private s_lastTimeStamp;
  uint256 private immutable i_interval;

  // Events, Naming events => reverse function name
  event RaffleEnter(address indexed player);
  event RequestedRaffleWinner(uint256 indexed requestId);
  event WinnerPicked(address indexed winner);

  // Functions
  constructor(
    address vrfCoordinatorV2,
    uint256 entranceFee,
    bytes32 gasLane,
    uint64 subscripitonId,
    uint32 callbackGasLimit,
    uint256 interval
  ) VRFConsumerBaseV2(vrfCoordinatorV2) {
    i_entranceFee = entranceFee;
    // Coordinator is onchain and it interacts with chainlink when we want to request a random number, calling an event
    i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
    i_gasLane = gasLane;
    i_subscriptionId = subscripitonId;
    i_callbackGasLimit = callbackGasLimit;
    s_raffleState = RaffleState.OPEN;
    s_lastTimeStamp = block.timestamp;
    i_interval = interval;
  }

  function enterRaffle() public payable {
    // entrance fee check up
    if (msg.value < i_entranceFee) {
      revert Raffle__NotEnoughETHEntered();
    }
    // is lottery open check up
    if (s_raffleState != RaffleState.OPEN) {
      revert Raffle__NotOpen();
    }
    s_players.push(payable(msg.sender));
    // Emit an event when we update a dynamic array or mapping
    emit RaffleEnter(msg.sender);
  }

  /**
   * @dev This is the function that the Chainlink Keeper nodes call
   * they look for `upkeepNeeded` to return True.
   * When `upkeepNeeded` is true it will call a performUpkeep function
   * the following should be true for this to return true:
   * 1. The time interval has passed between raffle runs.
   * 2. The lottery is open.
   * 3. The contract has ETH.
   * 4. Implicity, your subscription is funded with LINK.
   */
  // Off chain
  function checkUpkeep(
    bytes memory /*checkData*/
  ) public view override returns (bool upkeepNeeded, bytes memory /* performData */) {
    bool isOpen = (RaffleState.OPEN == s_raffleState);
    bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
    bool hasPlayers = (s_players.length > 0);
    bool hasBalance = address(this).balance > 0;
    upkeepNeeded = (isOpen && timePassed && hasPlayers && hasBalance);
  }

  // On chain
  function performUpkeep(bytes calldata /* performdata */) external override {
    // Request random number
    // Once we get it, do something with it
    // 2 transaction process
    (bool upkeepNeeded, ) = checkUpkeep('');
    // If conditions for lottery to run are not true, trow an error
    if (!upkeepNeeded) {
      revert Raffle__UpkeepNotNeeded(
        address(this).balance,
        s_players.length,
        uint256(s_raffleState)
      );
    }
    s_raffleState = RaffleState.CALCULATING;
    // VRFCOORDINATOR ALSO HAS EVENT, WITH REQUESTID AND TI WILL BE EMITTED BEFORE OUR EVENT
    uint256 requestId = i_vrfCoordinator.requestRandomWords(
      i_gasLane, //gasLane
      i_subscriptionId,
      REQUEST_CONFIRMATION, // How many block to be confirmed before our request
      i_callbackGasLimit, // Limits the gas, if we are spending to much on find random func
      NUM_WORDS // Number of random number we want to get, in our case only 1;
    );
    // This event is events[1]
    emit RequestedRaffleWinner(requestId);
  }

  // Overriding fullfill func from VRFConsumer(extended contract)
  function fulfillRandomWords(
    uint256 /*requestId*/,
    uint256[] memory randomWords
  ) internal override {
    // e.g. 202 % 10 = 2, we have just one random number
    uint256 indexOfWinner = randomWords[0] % s_players.length;
    address payable recentWinner = s_players[indexOfWinner];
    s_recentWinner = recentWinner;
    /* RESETING AFTER WE HAVE A WINNER  */
    // Set lottery state to open after we have a winner
    s_raffleState = RaffleState.OPEN;
    // Reset array of players after game is done
    s_players = new address payable[](0);
    // Reset timestamp after we have a winner
    s_lastTimeStamp = block.timestamp;
    (bool success, ) = recentWinner.call{value: address(this).balance}('');
    if (!success) {
      revert Raffle__TransferFailed();
    }
    emit WinnerPicked(recentWinner);
  }

  // View/pure
  function getEntranceFee() public view returns (uint256) {
    return i_entranceFee;
  }

  function getPlayer(uint256 index) public view returns (address) {
    return s_players[index];
  }

  function getRecentWinner() public view returns (address) {
    return s_recentWinner;
  }

  function getRaffleState() public view returns (RaffleState) {
    return s_raffleState;
  }

  // It is pure because the NUM_WORDS is constant variable
  function getNumWords() public pure returns (uint256) {
    return NUM_WORDS;
  }

  function getNumberOfPlayers() public view returns (uint256) {
    return s_players.length;
  }

  function getLatestTimeStamp() public view returns (uint256) {
    return s_lastTimeStamp;
  }

  function getRequestConfirmations() public pure returns (uint256) {
    return REQUEST_CONFIRMATION;
  }

  function getInterval() public view returns (uint256) {
    return i_interval;
  }
}
