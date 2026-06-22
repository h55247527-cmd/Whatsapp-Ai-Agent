// src/utils/memory.js
// Keeps conversation history per user so bot remembers context

const conversationMap = new Map();
const MAX_HISTORY = 15; // Keep last 15 messages per user

export class Memory {
  // Get conversation history for a user
  static get(number) {
    return conversationMap.get(number) || [];
  }

  // Add a message to history
  static add(number, role, content) {
    if (!conversationMap.has(number)) {
      conversationMap.set(number, []);
    }

    const history = conversationMap.get(number);
    history.push({ role, content });

    // Trim old messages to avoid token overflow
    if (history.length > MAX_HISTORY * 2) {
      history.splice(0, 2); // Remove oldest pair
    }
  }

  // Clear history for a user
  static clear(number) {
    conversationMap.delete(number);
  }

  // Get count of active conversations
  static activeCount() {
    return conversationMap.size;
  }

  // Add system context at start if history is empty
  static initIfEmpty(number, systemHint) {
    if (!conversationMap.has(number)) {
      conversationMap.set(number, []);
    }
  }
}
