const { spawn } = require('child_process');

// Check if we should skip deployment (set SKIP_DEPLOY=true to skip)
const skipDeploy = process.env.SKIP_DEPLOY === 'true';

if (skipDeploy) {
    console.log('⏭️  Skipping command deployment (SKIP_DEPLOY=true)\n');
    console.log('🤖 Starting bot...\n');
    
    // Start the bot directly
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
    console.log('🚀 Starting bot and deploying commands concurrently...\n');
    
    // Start the bot immediately to satisfy Render's port binding requirement
    console.log('🤖 Starting bot process...');
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

    // Deploy commands in the background
    console.log('� Deploying commands to Discord in background...');
    const deployProcess = spawn('node', ['deploy-commands.js'], {
        stdio: 'inherit',
        cwd: __dirname
    });

    deployProcess.on('close', (deployCode) => {
        if (deployCode === 0) {
            console.log('\n✅ Commands deployed successfully!');
        } else {
            console.error(`\n❌ Command deployment failed with code ${deployCode}`);
        }
    });

    deployProcess.on('error', (error) => {
        console.error('❌ Error deploying commands:', error);
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down bot...');
        botProcess.kill('SIGINT');
        if (deployProcess.exitCode === null) deployProcess.kill('SIGINT');
    });
    
    process.on('SIGTERM', () => {
        console.log('\n🛑 Shutting down bot...');
        botProcess.kill('SIGTERM');
        if (deployProcess.exitCode === null) deployProcess.kill('SIGTERM');
    });
}
