const { run } = require('hardhat');

// Verification
async function verify(contractAddress, args) {
  console.log('Verifying contact...');
  try {
    await run('verify:verify', {
      address: contractAddress,
      constructorArguments: args,
    });
  } catch (error) {
    if (error.message.toLowerCase().includes('already verified')) {
      console.log('already verified ');
    } else {
      console.log(error);
    }
  }
}

module.exports = { verify };
