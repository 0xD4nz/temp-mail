// Re-export everything from database layer
// This file maintains backward compatibility while using SQLite storage

export {
    // Types
    type Email,
    type Attachment,
    type Inbox,
    type GlobalStats,

    // Domain functions
    AVAILABLE_DOMAINS,
    getAvailableDomains,

    // Utility functions
    generateRandomString,
    isUsernameAvailable,

    // Inbox functions
    registerAddress,
    getInbox,
    isAddressActive,
    getAllInboxes,
    extendInbox,
    setForwardAddress,
    deleteInbox,

    // Email functions
    addEmail,
    getEmails,
    getEmailById,
    markAsRead,
    deleteEmail,
    deleteAllEmails,
    getTrashedEmails,
    restoreEmail,
    permanentlyDeleteEmail,
    searchEmails,

    // Stats functions
    getGlobalStats,
    getInboxStats,

    // Cleanup
    cleanupExpired
} from './database';
