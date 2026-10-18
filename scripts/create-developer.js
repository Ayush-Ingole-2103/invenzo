// ============================================
// CLI Script: Create Platform Developer
// Usage: node scripts/create-developer.js --name "Admin Name" --username "admin_user" --password "Secret123!"
// ============================================
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { initDatabase, run, get } = require('../database/db');

async function main() {
    await initDatabase();

    const args = process.argv.slice(2);
    let name = '';
    let username = '';
    let password = '';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--name' && args[i + 1]) name = args[i + 1];
        if (args[i] === '--username' && args[i + 1]) username = args[i + 1];
        if (args[i] === '--password' && args[i + 1]) password = args[i + 1];
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (query) => new Promise((resolve) => rl.question(query, resolve));

    if (!name) name = await question('Developer Full Name: ');
    if (!username) username = await question('Developer Username: ');
    if (!password) password = await question('Developer Password (min 12 chars): ');
    rl.close();

    if (!name.trim() || !username.trim() || !password || password.length < 12) {
        console.error('Error: Name, Username, and Password (min 12 chars) are required.');
        process.exit(1);
    }

    const cleanUser = username.trim();
    const existing = get('SELECT id FROM developers WHERE username = ? COLLATE NOCASE', [cleanUser]);
    if (existing) {
        console.error(`Error: Developer with username "${cleanUser}" already exists.`);
        process.exit(1);
    }

    const hash = bcrypt.hashSync(password, 12);
    run('INSERT INTO developers (name, username, password_hash, is_active) VALUES (?, ?, ?, 1)',
        [name.trim(), cleanUser, hash]);

    console.log(`\nDeveloper account "${cleanUser}" successfully created.`);
    process.exit(0);
}

main().catch(err => {
    console.error('Failed to create developer:', err);
    process.exit(1);
});
