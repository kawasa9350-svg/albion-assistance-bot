const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting bot with command deployment...\n');

// First, deploy commands
console.log('📝 Deploying commands to Discord...');
const deployProcess = spawn('node', ['deploy-commands.js'], {
    stdio: 'inherit',
    cwd: __dirname
});

deployProcess.on('close', (deployCode) => {
    if (deployCode === 0) {
        console.log('\n✅ Commands deployed successfully!');
        console.log('🤖 Starting bot...\n');
        
        // Start the bot
        const botProcess = spawn('node', ['index.js'], {
            stdio: 'inherit',
            cwd: __dirname
        });
        
        botProcess.on('close', (botCode) => {
            console.log(`\n🛑 Bot stopped with code ${botCode}`);
            process.exit(botCode);
        });
        
        botProcess.on('error', (error) => {
            console.error('❌ Error starting bot:', error);
            process.exit(1);
        });
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n🛑 Shutting down bot...');
            botProcess.kill('SIGINT');
        });
        
        process.on('SIGTERM', () => {
            console.log('\n🛑 Shutting down bot...');
            botProcess.kill('SIGTERM');
        });
        
    } else {
        console.error(`\n❌ Command deployment failed with code ${deployCode}`);
        console.log('🤖 Starting bot anyway (commands may not be updated)...\n');
        
        // Start the bot even if deployment failed
        const botProcess = spawn('node', ['index.js'], {
            stdio: 'inherit',
            cwd: __dirname
        });
        
        botProcess.on('close', (botCode) => {
            console.log(`\n🛑 Bot stopped with code ${botCode}`);
            process.exit(botCode);
        });
        
        botProcess.on('error', (error) => {
            console.error('❌ Error starting bot:', error);
            process.exit(1);
        });
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n🛑 Shutting down bot...');
            botProcess.kill('SIGINT');
        });
        
        process.on('SIGTERM', () => {
            console.log('\n🛑 Shutting down bot...');
            botProcess.kill('SIGTERM');
        });
    }
});

deployProcess.on('error', (error) => {
    console.error('❌ Error deploying commands:', error);
    console.log('🤖 Starting bot anyway (commands may not be updated)...\n');
    
    // Start the bot even if deployment failed
    const botProcess = spawn('node', ['index.js'], {
        stdio: 'inherit',
        cwd: __dirname
    });
    
    botProcess.on('close', (botCode) => {
        console.log(`\n🛑 Bot stopped with code ${botCode}`);
        process.exit(botCode);
    });
    
    botProcess.on('error', (error) => {
        console.error('❌ Error starting bot:', error);
        process.exit(1);
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down bot...');
        botProcess.kill('SIGINT');
    });
    
    process.on('SIGTERM', () => {
        console.log('\n🛑 Shutting down bot...');
        botProcess.kill('SIGTERM');
    });
});
