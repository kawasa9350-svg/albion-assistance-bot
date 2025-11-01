const { MongoClient } = require('mongodb');
const fs = require('fs');

class DatabaseManager {
    constructor() {
        this.config = require('./config.js');
        this.client = null;
        this.db = null;
        this.guildCollections = new Map();
    }

    async connect() {
        try {
            this.client = new MongoClient(this.config.database.uri);
            await this.client.connect();
            this.db = this.client.db(this.config.database.databaseName);
            console.log('✅ Connected to MongoDB successfully!');
            return true;
        } catch (error) {
            console.error('❌ Failed to connect to MongoDB:', error);
            return false;
        }
    }

    async disconnect() {
        if (this.client) {
            await this.client.close();
            console.log('🔌 Disconnected from MongoDB');
        }
    }

    async registerGuild(guildId, guildName) {
        try {
            const guildCollection = this.db.collection(`guild_${guildId}`);
            
            // Create guild document
            await guildCollection.insertOne({
                guildId: guildId,
                guildName: guildName,
                registeredAt: new Date(),
                guildPrefix: null,
                permissions: {},
                contentTypes: [],
                taxRates: {},
                users: {},
                builds: [],
                lootSplits: []
            });

            this.guildCollections.set(guildId, guildCollection);
            console.log(`✅ Registered guild: ${guildName} (${guildId})`);
            return true;
        } catch (error) {
            console.error('❌ Failed to register guild:', error);
            return false;
        }
    }

    async setGuildPrefix(guildId, prefix) {
        try {
            const collection = await this.getGuildCollection(guildId);
            await collection.updateOne(
                { guildId: guildId },
                { $set: { guildPrefix: prefix } }
            );
            console.log(`✅ Set guild prefix: ${prefix} for guild ${guildId}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to set guild prefix:', error);
            return false;
        }
    }

    async getGuildPrefix(guildId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            return guild ? guild.guildPrefix : null;
        } catch (error) {
            console.error('❌ Failed to get guild prefix:', error);
            return null;
        }
    }

    async registerUser(guildId, userId, inGameName, shouldApplyPrefix = true) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            if (!guild) {
                console.error('❌ Guild not found for user registration');
                return { success: false, error: 'Guild not found' };
            }

            // Get guild prefix and determine display name
            const guildPrefix = guild.guildPrefix || '';
            const displayName = (shouldApplyPrefix && guildPrefix) ? `${guildPrefix} ${inGameName}` : inGameName;

            // Check if user already exists
            const existingUser = await collection.findOne({ 
                guildId: guildId,
                [`users.${userId}`]: { $exists: true }
            });

            if (existingUser) {
                console.log(`⚠️ User ${userId} already registered in guild ${guildId}`);
                return { success: false, error: 'User already registered' };
            }

            // Add user to guild document
            await collection.updateOne(
                { guildId: guildId },
                { 
                    $set: { 
                        [`users.${userId}`]: {
                            inGameName: inGameName,
                            balance: 0,
                            attendance: 0,
                            registeredAt: new Date()
                        }
                    }
                }
            );

            console.log(`✅ Registered user: ${inGameName} (${userId}) in guild ${guildId}`);
            return { success: true, displayName: displayName };
        } catch (error) {
            console.error('❌ Failed to register user:', error);
            return { success: false, error: error.message };
        }
    }

    async updateUserInGameName(guildId, userId, newInGameName, shouldApplyPrefix = true) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            if (!guild || !guild.users || !guild.users[userId]) {
                console.error('❌ User not found for in-game name update');
                return { success: false, error: 'User not found' };
            }

            // Get guild prefix and determine display name
            const guildPrefix = guild.guildPrefix || '';
            const displayName = (shouldApplyPrefix && guildPrefix) ? `${guildPrefix} ${newInGameName}` : newInGameName;

            // Update the user's in-game name
            await collection.updateOne(
                { guildId: guildId },
                { 
                    $set: { 
                        [`users.${userId}.inGameName`]: newInGameName,
                        [`users.${userId}.updatedAt`]: new Date()
                    }
                }
            );

            console.log(`✅ Updated in-game name for user ${userId} in guild ${guildId}: ${newInGameName}`);
            return { success: true, displayName: displayName };
        } catch (error) {
            console.error('❌ Failed to update user in-game name:', error);
            return { success: false, error: error.message };
        }
    }

    async getUserRegistration(guildId, userId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            if (!guild || !guild.users || !guild.users[userId]) {
                return null;
            }
            
            return guild.users[userId];
        } catch (error) {
            console.error('❌ Failed to get user registration:', error);
            return null;
        }
    }

    async isUserRegistered(guildId, userId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            return !!(guild && guild.users && guild.users[userId]);
        } catch (error) {
            console.error('❌ Failed to check user registration:', error);
            return false;
        }
    }

    async setTaxRate(guildId, contentType, taxRate) {
        try {
            const collection = await this.getGuildCollection(guildId);
            await collection.updateOne(
                { guildId: guildId },
                { $set: { [`taxRates.${contentType}`]: taxRate } }
            );
            console.log(`✅ Set tax rate: ${taxRate}% for ${contentType} in guild ${guildId}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to set tax rate:', error);
            return false;
        }
    }

    async getTaxRate(guildId, contentType) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            if (!guild || !guild.taxRates) {
                return 0; // Default tax rate
            }
            
            return guild.taxRates[contentType] || 0;
        } catch (error) {
            console.error('❌ Failed to get tax rate:', error);
            return 0;
        }
    }

    async getAllTaxRates(guildId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            return guild ? guild.taxRates || {} : {};
        } catch (error) {
            console.error('❌ Failed to get all tax rates:', error);
            return {};
        }
    }

    async updateUserBalance(guildId, userId, amount, operation) {
        try {
            const collection = await this.getGuildCollection(guildId);
            
            if (operation === 'add') {
                await collection.updateOne(
                    { guildId: guildId },
                    { $inc: { [`users.${userId}.balance`]: amount } }
                );
            } else if (operation === 'subtract') {
                await collection.updateOne(
                    { guildId: guildId },
                    { $inc: { [`users.${userId}.balance`]: -amount } }
                );
            }
            
            console.log(`✅ Updated balance for user ${userId} in guild ${guildId}: ${operation} ${amount}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to update user balance:', error);
            return false;
        }
    }

    async getUserBalance(guildId, userId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            if (!guild || !guild.users || !guild.users[userId]) {
                return 0;
            }
            
            return guild.users[userId].balance || 0;
        } catch (error) {
            console.error('❌ Failed to get user balance:', error);
            return 0;
        }
    }

    async getAllUserBalances(guildId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            if (!guild || !guild.users) {
                return [];
            }
            
            const balances = [];
            for (const [userId, userData] of Object.entries(guild.users)) {
                balances.push({
                    userId: userId,
                    balance: userData.balance || 0
                });
            }
            
            return balances;
        } catch (error) {
            console.error('❌ Failed to get all user balances:', error);
            return [];
        }
    }

    async createLootSplit(guildId, splitData) {
        try {
            const collection = await this.getGuildCollection(guildId);
            
            const lootSplit = {
                guildId: guildId,
                ...splitData,
                createdAt: new Date()
            };
            
            await collection.updateOne(
                { guildId: guildId },
                { $push: { lootSplits: lootSplit } }
            );
            
            console.log(`✅ Created loot split for guild ${guildId}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to create loot split:', error);
            return false;
        }
    }

    async getLootSplits(guildId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            return guild ? guild.lootSplits || [] : [];
        } catch (error) {
            console.error('❌ Failed to get loot splits:', error);
            return [];
        }
    }

    async getGuildCollection(guildId) {
        if (!this.guildCollections.has(guildId)) {
            const collection = this.db.collection(`guild_${guildId}`);
            this.guildCollections.set(guildId, collection);
        }
        return this.guildCollections.get(guildId);
    }

    async addPermission(guildId, roleId, command) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`🔐 Adding permission: guild ${guildId}, role ${roleId}, command ${command}`);
            
            // First, let's see the current state
            const currentGuild = await collection.findOne({ guildId: guildId });
            console.log('Current guild permissions:', currentGuild?.permissions);
            
            const result = await collection.updateOne(
                { guildId: guildId },
                { $addToSet: { [`permissions.${roleId}`]: command } }
            );
            
            console.log('Update result:', result);
            
            // Verify the permission was added
            const updatedGuild = await collection.findOne({ guildId: guildId });
            console.log('Updated guild permissions:', updatedGuild?.permissions);
            
            return true;
        } catch (error) {
            console.error('❌ Failed to add permission:', error);
            return false;
        }
    }

    async removePermission(guildId, roleId, command) {
        try {
            const collection = await this.getGuildCollection(guildId);
            await collection.updateOne(
                { guildId: guildId },
                { $pull: { [`permissions.${roleId}`]: command } }
            );
            return true;
        } catch (error) {
            console.error('❌ Failed to remove permission:', error);
            return false;
        }
    }

    async hasPermission(guildId, roleId, command) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            console.log(`🔍 Checking permission for guild ${guildId}, role ${roleId}, command ${command}`);
            console.log('Guild data:', guild);
            
            if (!guild || !guild.permissions) {
                console.log('❌ No guild or permissions found');
                return false;
            }
            
            const rolePerms = guild.permissions[roleId];
            console.log(`Role permissions for ${roleId}:`, rolePerms);
            
            const hasPermission = rolePerms && rolePerms.includes(command);
            console.log(`Permission check result: ${hasPermission}`);
            
            return hasPermission;
        } catch (error) {
            console.error('❌ Failed to check permission:', error);
            return false;
        }
    }

    async addContentType(guildId, contentType) {
        try {
            const collection = await this.getGuildCollection(guildId);
            await collection.updateOne(
                { guildId: guildId },
                { $addToSet: { contentTypes: contentType } }
            );
            return true;
        } catch (error) {
            console.error('❌ Failed to add content type:', error);
            return false;
        }
    }

    async getContentTypes(guildId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            return guild ? guild.contentTypes : [];
        } catch (error) {
            console.error('❌ Failed to get content types:', error);
            return [];
        }
    }

    async deleteContentType(guildId, contentType) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`🗑️ Deleting content type: ${contentType} from guild ${guildId}`);
            
            const result = await collection.updateOne(
                { guildId: guildId },
                { $pull: { contentTypes: contentType } }
            );
            
            console.log('Delete result:', result);
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('❌ Failed to delete content type:', error);
            return false;
        }
    }

    async addComp(guildId, compData) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`🎭 Adding composition: ${compData.name} to guild ${guildId}`);
            
            // Generate unique comp ID
            const compId = this.generateCompId();
            
            // Convert build names to build IDs and create comp-specific builds
            const buildIds = [];
            for (const buildName of compData.builds) {
                // Create a comp-specific build
                const buildData = {
                    name: buildName,
                    weapon: 'Not specified',
                    offhand: 'Not specified',
                    cape: 'Not specified',
                    head: 'Not specified',
                    chest: 'Not specified',
                    shoes: 'Not specified',
                    food: 'Not specified',
                    potion: 'Not specified',
                    contentType: compData.contentType || 'General',
                    createdBy: compData.createdBy,
                    createdAt: new Date()
                };
                
                const buildId = await this.addBuild(guildId, buildData, compId);
                if (buildId) {
                    buildIds.push(buildId);
                }
            }
            
            const comp = {
                guildId: guildId,
                compId: compId,
                type: 'composition', // Add type field to distinguish from events
                name: compData.name,
                contentType: compData.contentType,
                buildIds: buildIds, // Store build IDs instead of build names
                builds: compData.builds, // Keep original names for display
                createdBy: compData.createdBy,
                createdAt: compData.createdAt,
                lockView: compData.lockView !== undefined ? compData.lockView : true // Default to true (viewable)
            };
            
            const result = await collection.insertOne(comp);
            console.log('Add composition result:', result);
            return result.acknowledged;
        } catch (error) {
            console.error('❌ Failed to add composition:', error);
            return false;
        }
    }

    generateCompId() {
        // Generate a unique comp ID using timestamp and random string
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `comp_${timestamp}_${random}`;
    }

    async getComps(guildId, contentType = null) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`📋 Getting compositions for guild ${guildId}, content type: ${contentType}`);
            
            // Query for compositions only (exclude the main guild document)
            let query = { 
                guildId: guildId,
                type: 'composition',  // Only get documents with type: 'composition'
                name: { $exists: true }  // Ensure the document has a name field (compositions have names, guild doc doesn't)
            };
            
            if (contentType && contentType !== 'all') {
                query.contentType = contentType;
            }
            
            console.log('Database query:', JSON.stringify(query, null, 2));
            
            const comps = await collection.find(query).toArray();
            console.log(`Found ${comps.length} compositions`);
            console.log('Compositions found:', comps.map(comp => ({ name: comp.name, contentType: comp.contentType, type: comp.type })));
            return comps;
        } catch (error) {
            console.error('❌ Failed to get compositions:', error);
            return [];
        }
    }

    async deleteComp(guildId, compName) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`🗑️ Deleting composition: ${compName} from guild ${guildId}`);
            
            const result = await collection.deleteOne({ 
                guildId: guildId, 
                name: compName 
            });
            
            console.log('Delete composition result:', result);
            return result.deletedCount > 0;
        } catch (error) {
            console.error('❌ Failed to delete composition:', error);
            return false;
        }
    }

    async updateCompLockView(guildId, compName, lockView) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`🔒 Updating lockView for composition: ${compName} to ${lockView} in guild ${guildId}`);
            
            const result = await collection.updateOne(
                { 
                    guildId: guildId, 
                    name: compName,
                    type: 'composition'
                },
                { 
                    $set: { lockView: lockView } 
                }
            );
            
            console.log('Update lockView result:', result);
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('❌ Failed to update composition lockView:', error);
            return false;
        }
    }

    async addEvent(guildId, eventData) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`📅 Adding event: ${eventData.name} to guild ${guildId}`);
            
            const event = {
                guildId: guildId,
                type: 'event', // Add type field to distinguish from compositions
                name: eventData.name,
                dateTime: eventData.dateTime,
                timestamp: eventData.timestamp,
                formattedDateTime: eventData.formattedDateTime,
                relativeTime: eventData.relativeTime,
                contentType: eventData.contentType,
                compName: eventData.compName,
                createdBy: eventData.createdBy,
                createdAt: eventData.createdAt
            };
            
            const result = await collection.insertOne(event);
            console.log('Add event result:', result);
            return result.acknowledged;
        } catch (error) {
            console.error('❌ Failed to add event:', error);
            return false;
        }
    }

    async getEvents(guildId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`📅 Getting events for guild ${guildId}`);
            
            const events = await collection.find({ guildId: guildId, type: 'event' }).toArray(); // Filter by type to only get events
            console.log(`Found ${events.length} events`);
            return events;
        } catch (error) {
            console.error('❌ Failed to get events:', error);
            return [];
        }
    }

    async deleteEvent(guildId, eventName) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`🗑️ Deleting event: ${eventName} from guild ${guildId}`);
            
            const result = await collection.deleteOne({ 
                guildId: guildId, 
                type: 'event',
                name: eventName 
            });
            
            console.log('Delete event result:', result);
            return result.deletedCount > 0;
        } catch (error) {
            console.error('❌ Failed to delete event:', error);
            return false;
        }
    }

    // Add event signup methods
    async addEventSignup(guildId, eventName, buildIndex, userId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`✅ Adding signup: User ${userId} for event ${eventName}, build ${buildIndex}`);
            
            const result = await collection.updateOne(
                { guildId: guildId, type: 'event', name: eventName },
                { $set: { [`signups.build_${buildIndex}`]: [userId] } }
            );
            
            console.log('Add signup result:', result);
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('❌ Failed to add event signup:', error);
            return false;
        }
    }

    async removeEventSignup(guildId, eventName, buildIndex, userId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`❌ Removing signup: User ${userId} from event ${eventName}, build ${buildIndex}`);
            
            const result = await collection.updateOne(
                { guildId: guildId, type: 'event', name: eventName },
                { $unset: { [`signups.build_${buildIndex}`]: "" } }
            );
            
            console.log('Remove signup result:', result);
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('❌ Failed to remove event signup:', error);
            return false;
        }
    }

    async getEventSignups(guildId, eventName) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`📋 Getting signups for event: ${eventName} in guild ${guildId}`);
            
            const event = await collection.findOne({ 
                guildId: guildId, 
                type: 'event', 
                name: eventName 
            });
            
            if (!event || !event.signups) {
                console.log('No signups found for event');
                return new Map();
            }
            
            // Convert database signups to Map format
            const signupsMap = new Map();
            Object.keys(event.signups).forEach(key => {
                if (key.startsWith('build_')) {
                    const buildIndex = parseInt(key.replace('build_', ''));
                    signupsMap.set(`event_${eventName}_build_${buildIndex}`, event.signups[key]);
                }
            });
            
            console.log(`Found ${signupsMap.size} build signups`);
            return signupsMap;
        } catch (error) {
            console.error('❌ Failed to get event signups:', error);
            return new Map();
        }
    }

    async cleanupEventSignups(guildId, eventName) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`🧹 Cleaning up all signups for event: ${eventName} in guild ${guildId}`);
            
            const result = await collection.updateOne(
                { guildId: guildId, type: 'event', name: eventName },
                { $unset: { signups: "" } }
            );
            
            console.log('Cleanup event signups result:', result);
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('❌ Failed to cleanup event signups:', error);
            return false;
        }
    }

    // Add composition signup methods
    async addCompositionSignup(guildId, compName, buildIndex, userId, sessionId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`✅ Adding composition signup: User ${userId} for composition ${compName}, build ${buildIndex}, session ${sessionId}`);
            
            const result = await collection.updateOne(
                { guildId: guildId, type: 'composition', name: compName },
                { $set: { [`signups.${sessionId}.build_${buildIndex}`]: [userId] } }
            );
            
            console.log('Add composition signup result:', result);
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('❌ Failed to add composition signup:', error);
            return false;
        }
    }

    async removeCompositionSignup(guildId, compName, buildIndex, userId, sessionId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`❌ Removing composition signup: User ${userId} from composition ${compName}, build ${buildIndex}, session ${sessionId}`);
            
            const result = await collection.updateOne(
                { guildId: guildId, type: 'composition', name: compName },
                { $unset: { [`signups.${sessionId}.build_${buildIndex}`]: "" } }
            );
            
            console.log('Remove composition signup result:', result);
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('❌ Failed to remove composition signup:', error);
            return false;
        }
    }

    async getCompositionSignups(guildId, compName, sessionId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`📋 Getting signups for composition: ${compName}, session ${sessionId} in guild ${guildId}`);
            
            const composition = await collection.findOne({ 
                guildId: guildId, 
                type: 'composition', 
                name: compName 
            });
            
            if (!composition || !composition.signups || !composition.signups[sessionId]) {
                console.log('No signups found for composition and session');
                return new Map();
            }
            
            // Convert database signups to Map format
            const signupsMap = new Map();
            const sessionSignups = composition.signups[sessionId];
            Object.keys(sessionSignups).forEach(key => {
                if (key.startsWith('build_')) {
                    const buildIndex = parseInt(key.replace('build_', ''));
                    signupsMap.set(`comp_${compName}_${sessionId}_build_${buildIndex}`, sessionSignups[key]);
                }
            });
            
            console.log(`Found ${signupsMap.size} build signups for session ${sessionId}`);
            return signupsMap;
        } catch (error) {
            console.error('❌ Failed to get composition signups:', error);
            return new Map();
        }
    }

    async cleanupCompositionSignups(guildId, compName, sessionId = null) {
        try {
            const collection = await this.getGuildCollection(guildId);
            if (sessionId) {
                console.log(`🧹 Cleaning up signups for composition: ${compName}, session ${sessionId} in guild ${guildId}`);
                
                const result = await collection.updateOne(
                    { guildId: guildId, type: 'composition', name: compName },
                    { $unset: { [`signups.${sessionId}`]: "" } }
                );
                
                console.log('Cleanup composition signups result:', result);
                return result.modifiedCount > 0;
            } else {
                console.log(`🧹 Cleaning up all signups for composition: ${compName} in guild ${guildId}`);
                
                const result = await collection.updateOne(
                    { guildId: guildId, type: 'composition', name: compName },
                    { $unset: { signups: "" } }
                );
                
                console.log('Cleanup composition signups result:', result);
                return result.modifiedCount > 0;
            }
        } catch (error) {
            console.error('❌ Failed to cleanup composition signups:', error);
            return false;
        }
    }

    async addBuild(guildId, buildData, compId = null) {
        try {
            const collection = await this.getGuildCollection(guildId);
            
            // Generate unique build ID
            const buildId = this.generateBuildId();
            
            // Add build ID and comp ID to build data
            const buildWithId = {
                ...buildData,
                buildId: buildId,
                compId: compId, // null for global builds, compId for comp-specific builds
                createdAt: buildData.createdAt || new Date()
            };
            
            await collection.updateOne(
                { guildId: guildId },
                { $push: { builds: buildWithId } }
            );
            
            console.log(`Added build with ID ${buildId}${compId ? ` for comp ${compId}` : ' (global)'}`);
            return buildId; // Return the build ID instead of just true
        } catch (error) {
            console.error('❌ Failed to add build:', error);
            return false;
        }
    }

    generateBuildId() {
        // Generate a unique build ID using timestamp and random string
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `build_${timestamp}_${random}`;
    }

    async deleteBuild(guildId, buildName) {
        try {
            const collection = await this.getGuildCollection(guildId);
            await collection.updateOne(
                { guildId: guildId },
                { $pull: { builds: { name: buildName } } }
            );
            return true;
        } catch (error) {
            console.error('❌ Failed to delete build:', error);
            return false;
        }
    }

    async getBuilds(guildId, contentType = null, buildName = null, compId = null) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            console.log(`Database getBuilds: Guild found: ${!!guild}, Has builds array: ${!!(guild && guild.builds)}, Builds count: ${guild && guild.builds ? guild.builds.length : 0}`);
            
            if (!guild || !guild.builds) {
                console.log('Database getBuilds: No guild or builds array found, returning empty array');
                return [];
            }
            
            let builds = guild.builds;
            console.log(`Database getBuilds: Starting with ${builds.length} builds, contentType filter: ${contentType}, buildName filter: ${buildName}, compId filter: ${compId}`);
            
            // Filter by comp ID if specified
            if (compId !== null) {
                builds = builds.filter(build => build.compId === compId);
                console.log(`Database getBuilds: After compId filter: ${builds.length} builds`);
            } else {
                // If no compId specified, return global builds (compId is null or undefined for legacy builds)
                builds = builds.filter(build => build.compId === null || build.compId === undefined);
                console.log(`Database getBuilds: After global filter: ${builds.length} builds`);
            }
            
            if (contentType) {
                builds = builds.filter(build => build.contentType === contentType);
                console.log(`Database getBuilds: After contentType filter: ${builds.length} builds`);
            }
            
            if (buildName) {
                builds = builds.filter(build => 
                    build.name.toLowerCase().includes(buildName.toLowerCase())
                );
                console.log(`Database getBuilds: After buildName filter: ${builds.length} builds`);
            }
            
            console.log(`Database getBuilds: Returning ${builds.length} builds`);
            return builds;
        } catch (error) {
            console.error('❌ Failed to get builds:', error);
            return [];
        }
    }

    async getBuildsByCompId(guildId, compId) {
        try {
            return await this.getBuilds(guildId, null, null, compId);
        } catch (error) {
            console.error('❌ Failed to get builds by comp ID:', error);
            return [];
        }
    }

    async getBuildById(guildId, buildId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            if (!guild || !guild.builds) {
                console.log(`No guild or builds found for guildId: ${guildId}`);
                return null;
            }
            
            console.log(`Searching for buildId: ${buildId} in ${guild.builds.length} builds`);
            const build = guild.builds.find(build => build.buildId === buildId);
            
            if (build) {
                console.log(`Found build: ${build.name} with buildId: ${build.buildId}`);
            } else {
                console.log(`Build not found. Available buildIds: ${guild.builds.map(b => b.buildId).join(', ')}`);
            }
            
            return build || null;
        } catch (error) {
            console.error('❌ Failed to get build by ID:', error);
            return null;
        }
    }

    async getCompBuilds(guildId, compId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const comp = await collection.findOne({ compId: compId });
            
            if (!comp) {
                console.log(`Comp not found for compId: ${compId}`);
                return [];
            }
            
            console.log(`Found comp: ${comp.name}, buildIds: ${comp.buildIds ? comp.buildIds.length : 'none'}`);
            
            // Check if this is a legacy comp (no buildIds field)
            if (!comp.buildIds) {
                console.log(`Legacy comp detected: ${comp.name}, migrating...`);
                return await this.migrateLegacyComp(guildId, comp);
            }
            
            // Get all builds for this composition
            const builds = [];
            for (const buildId of comp.buildIds) {
                console.log(`Looking for build with ID: ${buildId}`);
                const build = await this.getBuildById(guildId, buildId);
                if (build) {
                    console.log(`Found build: ${build.name} (${build.buildId})`);
                    builds.push(build);
                } else {
                    console.log(`Build not found for ID: ${buildId}`);
                }
            }
            
            console.log(`Returning ${builds.length} builds for comp ${comp.name}`);
            return builds;
        } catch (error) {
            console.error('❌ Failed to get comp builds:', error);
            return [];
        }
    }

    async getCompNameById(guildId, compId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const comp = await collection.findOne({ compId: compId });
            
            if (!comp) {
                console.log(`Comp not found for compId: ${compId}`);
                return null;
            }
            
            return comp.name;
        } catch (error) {
            console.error('❌ Failed to get comp name by ID:', error);
            return null;
        }
    }

    async migrateLegacyComp(guildId, comp) {
        try {
            console.log(`Migrating legacy comp: ${comp.name}`);
            
            // Generate comp ID if it doesn't exist
            if (!comp.compId) {
                comp.compId = this.generateCompId();
            }
            
            // Create build IDs for each build name
            const buildIds = [];
            const builds = [];
            
            for (const buildName of comp.builds) {
                // Check if build already exists globally
                const existingBuilds = await this.getBuilds(guildId, null, buildName, null);
                let build = existingBuilds.find(b => b.name === buildName);
                
                if (!build) {
                    // Create a new comp-specific build
                    const buildData = {
                        name: buildName,
                        weapon: 'Not specified',
                        offhand: 'Not specified',
                        cape: 'Not specified',
                        head: 'Not specified',
                        chest: 'Not specified',
                        shoes: 'Not specified',
                        food: 'Not specified',
                        potion: 'Not specified',
                        contentType: comp.contentType || 'General',
                        createdBy: comp.createdBy,
                        createdAt: comp.createdAt || new Date()
                    };
                    
                    const buildId = await this.addBuild(guildId, buildData, comp.compId);
                    if (buildId) {
                        buildIds.push(buildId);
                        build = await this.getBuildById(guildId, buildId);
                    }
                } else {
                    // Use existing build but make it comp-specific
                    const buildId = this.generateBuildId();
                    const compSpecificBuild = {
                        ...build,
                        buildId: buildId,
                        compId: comp.compId
                    };
                    
                    // Add the comp-specific version
                    await this.addBuild(guildId, compSpecificBuild, comp.compId);
                    buildIds.push(buildId);
                    build = compSpecificBuild;
                }
                
                if (build) {
                    builds.push(build);
                }
            }
            
            // Update the comp with build IDs
            const collection = await this.getGuildCollection(guildId);
            await collection.updateOne(
                { _id: comp._id },
                { 
                    $set: { 
                        compId: comp.compId,
                        buildIds: buildIds
                    } 
                }
            );
            
            console.log(`Successfully migrated comp: ${comp.name} with ${buildIds.length} builds`);
            return builds;
        } catch (error) {
            console.error('❌ Failed to migrate legacy comp:', error);
            return [];
        }
    }

    async migrateAllLegacyData(guildId) {
        try {
            console.log(`Starting migration for guild ${guildId}...`);
            
            const collection = await this.getGuildCollection(guildId);
            
            // Check if migration has already been completed
            const migrationStatus = await collection.findOne({ 
                guildId: guildId, 
                type: 'migration_status' 
            });
            
            if (migrationStatus && migrationStatus.completed) {
                console.log(`Migration already completed for guild ${guildId}`);
                return true;
            }
            
            // Find all legacy comps (no compId field)
            const legacyComps = await collection.find({ 
                type: 'composition', 
                compId: { $exists: false } 
            }).toArray();
            
            console.log(`Found ${legacyComps.length} legacy comps to migrate`);
            
            for (const comp of legacyComps) {
                await this.migrateLegacyComp(guildId, comp);
            }
            
            // Migrate legacy builds (no buildId field)
            const legacyBuilds = await collection.find({ 
                guildId: guildId,
                builds: { $exists: true }
            }).toArray();
            
            if (legacyBuilds.length > 0) {
                const guild = legacyBuilds[0];
                if (guild.builds) {
                    const buildsToMigrate = guild.builds.filter(build => !build.buildId);
                    console.log(`Found ${buildsToMigrate.length} legacy builds to migrate`);
                    
                    for (const build of buildsToMigrate) {
                        if (!build.buildId) {
                            build.buildId = this.generateBuildId();
                            build.compId = null; // Global build
                        }
                    }
                    
                    // Update the guild document
                    await collection.updateOne(
                        { guildId: guildId },
                        { $set: { builds: guild.builds } }
                    );
                }
            }
            
            // Mark migration as completed
            await collection.updateOne(
                { guildId: guildId, type: 'migration_status' },
                { 
                    $set: { 
                        guildId: guildId,
                        type: 'migration_status',
                        completed: true,
                        completedAt: new Date()
                    } 
                },
                { upsert: true }
            );
            
            console.log(`Migration completed for guild ${guildId}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to migrate legacy data:', error);
            return false;
        }
    }

    async updateBuildField(guildId, buildName, fieldName, newValue) {
        try {
            const collection = await this.getGuildCollection(guildId);
            
            const result = await collection.updateOne(
                { guildId: guildId, 'builds.name': buildName },
                { $set: { [`builds.$.${fieldName}`]: newValue } }
            );
            
            console.log(`✅ Updated build field: ${fieldName} for build: ${buildName} in guild: ${guildId}`);
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('❌ Failed to update build field:', error);
            return false;
        }
    }

    async updateBuildFieldById(guildId, buildId, fieldName, newValue) {
        try {
            const collection = await this.getGuildCollection(guildId);
            
            const result = await collection.updateOne(
                { guildId: guildId, 'builds.buildId': buildId },
                { $set: { [`builds.$.${fieldName}`]: newValue } }
            );
            
            console.log(`✅ Updated build field: ${fieldName} for build ID: ${buildId} in guild: ${guildId}`);
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('❌ Failed to update build field by ID:', error);
            return false;
        }
    }

    async deleteBuildById(guildId, buildId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            
            const result = await collection.updateOne(
                { guildId: guildId },
                { $pull: { builds: { buildId: buildId } } }
            );
            
            console.log(`✅ Deleted build with ID: ${buildId} from guild: ${guildId}`);
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('❌ Failed to delete build by ID:', error);
            return false;
        }
    }

    async updateCompositionBuildReferences(guildId, oldBuildName, newBuildName) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`🔧 Updating composition build references: ${oldBuildName} -> ${newBuildName} in guild ${guildId}`);
            
            // Find all compositions that reference the old build name
            const compositions = await collection.find({
                guildId: guildId,
                type: 'composition',
                builds: oldBuildName
            }).toArray();
            
            console.log(`Found ${compositions.length} compositions referencing build "${oldBuildName}"`);
            
            let updatedCount = 0;
            for (const comp of compositions) {
                // Update the builds array by replacing old name with new name
                const updatedBuilds = comp.builds.map(buildName => 
                    buildName === oldBuildName ? newBuildName : buildName
                );
                
                const result = await collection.updateOne(
                    { _id: comp._id },
                    { $set: { builds: updatedBuilds } }
                );
                
                if (result.modifiedCount > 0) {
                    updatedCount++;
                    console.log(`✅ Updated composition "${comp.name}" - replaced "${oldBuildName}" with "${newBuildName}"`);
                }
            }
            
            console.log(`Updated ${updatedCount} compositions with new build name`);
            return updatedCount;
        } catch (error) {
            console.error('❌ Failed to update composition build references:', error);
            return 0;
        }
    }

    async isGuildRegistered(guildId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            return !!guild;
        } catch (error) {
            console.error('❌ Failed to check guild registration:', error);
            return false;
        }
    }

    // Attendance tracking methods
    async addAttendanceToAllUsers(guildId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            if (!guild || !guild.users) {
                console.log('No users found in guild for attendance tracking');
                return { success: false, error: 'No users found' };
            }

            const userIds = Object.keys(guild.users);
            const updatePromises = userIds.map(userId => 
                collection.updateOne(
                    { guildId: guildId },
                    { $inc: { [`users.${userId}.attendance`]: 1 } }
                )
            );

            await Promise.all(updatePromises);
            
            console.log(`✅ Added attendance point to ${userIds.length} users in guild ${guildId}`);
            return { success: true, userCount: userIds.length };
        } catch (error) {
            console.error('❌ Failed to add attendance to all users:', error);
            return { success: false, error: error.message };
        }
    }

    async addAttendanceToUsers(guildId, userIds) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            if (!guild || !guild.users) {
                console.log('No users found in guild for attendance tracking');
                return { success: false, error: 'No users found' };
            }

            // Filter to only include registered users
            const registeredUserIds = userIds.filter(userId => guild.users[userId]);
            
            if (registeredUserIds.length === 0) {
                return { success: false, error: 'No registered users found in voice channel' };
            }

            const updatePromises = registeredUserIds.map(userId => 
                collection.updateOne(
                    { guildId: guildId },
                    { $inc: { [`users.${userId}.attendance`]: 1 } }
                )
            );

            await Promise.all(updatePromises);
            
            console.log(`✅ Added attendance point to ${registeredUserIds.length} users in voice channel for guild ${guildId}`);
            return { success: true, userCount: registeredUserIds.length, userIds: registeredUserIds };
        } catch (error) {
            console.error('❌ Failed to add attendance to users:', error);
            return { success: false, error: error.message };
        }
    }

    async wipeAllAttendance(guildId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            if (!guild || !guild.users) {
                console.log('No users found in guild for attendance wipe');
                return { success: false, error: 'No users found' };
            }

            const userIds = Object.keys(guild.users);
            const updatePromises = userIds.map(userId => 
                collection.updateOne(
                    { guildId: guildId },
                    { $set: { [`users.${userId}.attendance`]: 0 } }
                )
            );

            await Promise.all(updatePromises);
            
            console.log(`✅ Wiped attendance for ${userIds.length} users in guild ${guildId}`);
            return { success: true, userCount: userIds.length };
        } catch (error) {
            console.error('❌ Failed to wipe attendance:', error);
            return { success: false, error: error.message };
        }
    }

    async getUserAttendance(guildId, userId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            if (!guild || !guild.users || !guild.users[userId]) {
                return 0;
            }
            
            return guild.users[userId].attendance || 0;
        } catch (error) {
            console.error('❌ Failed to get user attendance:', error);
            return 0;
        }
    }

    async getAllUserAttendance(guildId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            if (!guild || !guild.users) {
                return [];
            }
            
            const attendanceData = [];
            for (const [userId, userData] of Object.entries(guild.users)) {
                attendanceData.push({
                    userId: userId,
                    attendance: userData.attendance || 0
                });
            }
            
            return attendanceData;
        } catch (error) {
            console.error('❌ Failed to get all user attendance:', error);
            return [];
        }
    }

    async addAttendanceToUser(guildId, userId, points) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            if (!guild || !guild.users || !guild.users[userId]) {
                return { success: false, error: 'User not found in guild' };
            }

            const result = await collection.updateOne(
                { guildId: guildId },
                { $inc: { [`users.${userId}.attendance`]: points } }
            );

            if (result.modifiedCount === 0) {
                return { success: false, error: 'Failed to update attendance' };
            }

            // Get the new total
            const newTotal = await this.getUserAttendance(guildId, userId);
            
            console.log(`✅ Added ${points} attendance point${points > 1 ? 's' : ''} to user ${userId} in guild ${guildId}`);
            return { success: true, newTotal: newTotal };
        } catch (error) {
            console.error('❌ Failed to add attendance to user:', error);
            return { success: false, error: error.message };
        }
    }

    async removeAttendanceFromUser(guildId, userId, points) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            if (!guild || !guild.users || !guild.users[userId]) {
                return { success: false, error: 'User not found in guild' };
            }

            const result = await collection.updateOne(
                { guildId: guildId },
                { $inc: { [`users.${userId}.attendance`]: -points } }
            );

            if (result.modifiedCount === 0) {
                return { success: false, error: 'Failed to update attendance' };
            }

            // Get the new total
            const newTotal = await this.getUserAttendance(guildId, userId);
            
            console.log(`✅ Removed ${points} attendance point${points > 1 ? 's' : ''} from user ${userId} in guild ${guildId}`);
            return { success: true, newTotal: newTotal };
        } catch (error) {
            console.error('❌ Failed to remove attendance from user:', error);
            return { success: false, error: error.message };
        }
    }

    // Voice channel setup methods
    async setVoiceChannelSetup(guildId, setupData) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`🎤 Setting voice channel setup for guild ${guildId}`);
            
            const result = await collection.updateOne(
                { guildId: guildId },
                { $set: { voiceChannelSetup: setupData } },
                { upsert: true }
            );
            
            console.log('Set voice channel setup result:', result);
            return result.acknowledged;
        } catch (error) {
            console.error('❌ Failed to set voice channel setup:', error);
            return false;
        }
    }

    async getVoiceChannelSetup(guildId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            return guild ? guild.voiceChannelSetup : null;
        } catch (error) {
            console.error('❌ Failed to get voice channel setup:', error);
            return null;
        }
    }

    async removeVoiceChannelSetup(guildId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`🗑️ Removing voice channel setup for guild ${guildId}`);
            
            const result = await collection.updateOne(
                { guildId: guildId },
                { $unset: { voiceChannelSetup: "" } }
            );
            
            console.log('Remove voice channel setup result:', result);
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('❌ Failed to remove voice channel setup:', error);
            return false;
        }
    }

    // Inventory management methods
    async addGearToInventory(guildId, gearData) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`📦 Adding gear to inventory: ${gearData.name} (${gearData.slot}) for guild ${guildId}`);
            
            // Check if gear already exists with same name, slot, and tier equivalent
            const existingGear = await collection.findOne({
                guildId: guildId,
                type: 'inventory_item',
                name: gearData.name,
                slot: gearData.slot,
                tierEquivalent: gearData.tierEquivalent
            });
            
            if (existingGear) {
                // Update quantity instead of creating duplicate
                const result = await collection.updateOne(
                    {
                        guildId: guildId,
                        type: 'inventory_item',
                        name: gearData.name,
                        slot: gearData.slot,
                        tierEquivalent: gearData.tierEquivalent
                    },
                    { $inc: { quantity: gearData.quantity || 1 } }
                );
                
                console.log(`✅ Updated quantity for existing gear: ${gearData.name}`);
                return result.modifiedCount > 0;
            } else {
                // Create new gear entry
                const gear = {
                    guildId: guildId,
                    type: 'inventory_item',
                    name: gearData.name,
                    slot: gearData.slot,
                    tierEquivalent: gearData.tierEquivalent,
                    quantity: gearData.quantity || 1,
                    notes: gearData.notes || '',
                    createdAt: new Date()
                };
                
                const result = await collection.insertOne(gear);
                console.log(`✅ Added new gear to inventory: ${gearData.name}`);
                return result.acknowledged;
            }
        } catch (error) {
            console.error('❌ Failed to add gear to inventory:', error);
            return false;
        }
    }

    async getInventory(guildId, slot = null, tierEquivalent = null, searchName = null) {
        try {
            const collection = await this.getGuildCollection(guildId);
            
            let query = {
                guildId: guildId,
                type: 'inventory_item'
            };
            
            if (slot) {
                query.slot = slot;
            }
            
            if (tierEquivalent) {
                query.tierEquivalent = tierEquivalent;
            }
            
            if (searchName) {
                query.name = { $regex: searchName, $options: 'i' };
            }
            
            const inventory = await collection.find(query).toArray();
            
            // Filter by search name if provided (case-insensitive)
            let filteredInventory = inventory;
            if (searchName && !query.name) {
                filteredInventory = inventory.filter(item => 
                    item.name.toLowerCase().includes(searchName.toLowerCase())
                );
            }
            
            return filteredInventory;
        } catch (error) {
            console.error('❌ Failed to get inventory:', error);
            return [];
        }
    }

    async removeGearFromInventory(guildId, gearName, slot, tierEquivalent, quantity = 1) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`📦 Removing gear from inventory: ${gearName} (${slot}, ${tierEquivalent}), quantity: ${quantity} for guild ${guildId}`);
            
            const gear = await collection.findOne({
                guildId: guildId,
                type: 'inventory_item',
                name: gearName,
                slot: slot,
                tierEquivalent: tierEquivalent
            });
            
            if (!gear) {
                console.log(`❌ Gear not found: ${gearName} (${slot}, ${tierEquivalent})`);
                return { success: false, error: 'Gear not found in inventory' };
            }
            
            if (gear.quantity <= quantity) {
                // Remove the gear entry completely
                const result = await collection.deleteOne({
                    guildId: guildId,
                    type: 'inventory_item',
                    name: gearName,
                    slot: slot,
                    tierEquivalent: tierEquivalent
                });
                
                console.log(`✅ Removed gear completely from inventory: ${gearName}`);
                return { success: true, remainingQuantity: 0 };
            } else {
                // Decrease quantity
                const result = await collection.updateOne(
                    {
                        guildId: guildId,
                        type: 'inventory_item',
                        name: gearName,
                        slot: slot,
                        tierEquivalent: tierEquivalent
                    },
                    { $inc: { quantity: -quantity } }
                );
                
                const remainingGear = await collection.findOne({
                    guildId: guildId,
                    type: 'inventory_item',
                    name: gearName,
                    slot: slot,
                    tierEquivalent: tierEquivalent
                });
                
                console.log(`✅ Decreased quantity for gear: ${gearName}, remaining: ${remainingGear.quantity}`);
                return { success: true, remainingQuantity: remainingGear.quantity };
            }
        } catch (error) {
            console.error('❌ Failed to remove gear from inventory:', error);
            return { success: false, error: error.message };
        }
    }

    async getInventoryBySlot(guildId, slot) {
        try {
            return await this.getInventory(guildId, slot);
        } catch (error) {
            console.error('❌ Failed to get inventory by slot:', error);
            return [];
        }
    }

    async setRegearLogChannel(guildId, channelId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            await collection.updateOne(
                { guildId: guildId },
                { $set: { regearLogChannelId: channelId } },
                { upsert: false }
            );
            console.log(`✅ Set regear log channel: ${channelId} for guild ${guildId}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to set regear log channel:', error);
            return false;
        }
    }

    async getRegearLogChannel(guildId) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            return guild ? guild.regearLogChannelId : null;
        } catch (error) {
            console.error('❌ Failed to get regear log channel:', error);
            return null;
        }
    }
}

module.exports = DatabaseManager;
