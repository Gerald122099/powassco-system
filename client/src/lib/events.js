// Simple event emitter for cross-component communication
// This allows components to communicate without prop drilling

const events = {};

/**
 * Subscribe to an event
 * @param {string} event - Event name to listen for
 * @param {Function} callback - Function to call when event is emitted
 * @returns {Function} - Unsubscribe function
 */
export const on = (event, callback) => {
  if (!events[event]) {
    events[event] = [];
  }
  events[event].push(callback);
  
  // Return unsubscribe function
  return () => {
    events[event] = events[event].filter(cb => cb !== callback);
  };
};

/**
 * Emit an event with data
 * @param {string} event - Event name to emit
 * @param {any} data - Data to pass to listeners
 */
export const emit = (event, data) => {
  if (events[event]) {
    events[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for "${event}":`, error);
      }
    });
  }
};

/**
 * Remove all listeners for an event
 * @param {string} event - Event name to clear
 */
export const clear = (event) => {
  if (event) {
    delete events[event];
  } else {
    // Clear all events
    Object.keys(events).forEach(key => delete events[key]);
  }
};

/**
 * Get all registered events (for debugging)
 * @returns {Object} - All events and their listener counts
 */
export const getEvents = () => {
  const result = {};
  Object.keys(events).forEach(key => {
    result[key] = events[key].length;
  });
  return result;
};