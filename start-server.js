#!/usr/bin/env node

// This script starts the server without needing npm
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Check if node_modules exists
if (!fs.existsSync(path.join(__dirname, 'node_modules'))) {
	console.log('Installing dependencies first...');
	const install = spawn('npm.cmd', ['install'], {
		cwd: __dirname,
		stdio: 'inherit',
		shell: true,
	});

	install.on('close', (code) => {
		if (code === 0) {
			startServer();
		} else {
			console.error('Failed to install dependencies');
			process.exit(1);
		}
	});
} else {
	startServer();
}

function startServer() {
	console.log('Starting Quiz Server...');
	require('./server.js');
}
