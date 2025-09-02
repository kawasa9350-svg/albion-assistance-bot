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
            
            const comp = {
                guildId: guildId,
                type: 'composition', // Add type field to distinguish from events
                name: compData.name,
                contentType: compData.contentType,
                builds: compData.builds,
                createdBy: compData.createdBy,
                createdAt: compData.createdAt
            };
            
            const result = await collection.insertOne(comp);
            console.log('Add composition result:', result);
            return result.acknowledged;
        } catch (error) {
            console.error('❌ Failed to add composition:', error);
            return false;
        }
    }

    async getComps(guildId, contentType = null) {
        try {
            const collection = await this.getGuildCollection(guildId);
            console.log(`📋 Getting compositions for guild ${guildId}, content type: ${contentType}`);
            
            // Query for both old compositions (without type) and new ones (with type: 'composition')
            let query = { 
                guildId: guildId,
                $or: [
                    { type: 'composition' },           // New compositions with type field
                    { type: { $exists: false } }       // Old compositions without type field
                ]
            };
            
            if (contentType && contentType !== 'all') {
                query.contentType = contentType;
            }
            
            const comps = await collection.find(query).toArray();
            console.log(`Found ${comps.length} compositions`);
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

    async addBuild(guildId, buildData) {
        try {
            const collection = await this.getGuildCollection(guildId);
            await collection.updateOne(
                { guildId: guildId },
                { $push: { builds: buildData } }
            );
            return true;
        } catch (error) {
            console.error('❌ Failed to add build:', error);
            return false;
        }
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

    async getBuilds(guildId, contentType = null, buildName = null) {
        try {
            const collection = await this.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            if (!guild || !guild.builds) return [];
            
            let builds = guild.builds;
            
            if (contentType) {
                builds = builds.filter(build => build.contentType === contentType);
            }
            
            if (buildName) {
                builds = builds.filter(build => 
                    build.name.toLowerCase().includes(buildName.toLowerCase())
                );
            }
            
            return builds;
        } catch (error) {
            console.error('❌ Failed to get builds:', error);
            return [];
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
}

module.exports = DatabaseManager;
