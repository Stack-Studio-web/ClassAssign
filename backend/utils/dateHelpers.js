// backend/utils/dateHelpers.js
/**
 * Converts any date input to YYYY-MM-DD format without timezone conversion
 * Works with Date objects, ISO strings, or YYYY-MM-DD strings
 */
const toDateOnly = (dateInput) => {
  if (!dateInput) return null;
  
  // If already in YYYY-MM-DD format, return as-is
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return dateInput;
  }
  
  // Handle Date objects or ISO strings
  let dateObj;
  if (dateInput instanceof Date) {
    dateObj = dateInput;
  } else {
    dateObj = new Date(dateInput);
  }
  
  if (isNaN(dateObj.getTime())) {
    return null;
  }
  
  // Extract local date components (not UTC)
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Converts YYYY-MM-DD to a Date object at midnight local time
 */
const fromDateOnly = (dateString) => {
  if (!dateString) return null;
  
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

/**
 * Formats a date for display (e.g., "15 Feb 2024")
 */
const formatForDisplay = (dateInput) => {
  const dateObj = typeof dateInput === 'string' 
    ? fromDateOnly(dateInput) 
    : dateInput;
    
  if (!dateObj || isNaN(dateObj.getTime())) return '';
  
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return dateObj.toLocaleDateString('en-GB', options);
};

module.exports = {
  toDateOnly,
  fromDateOnly,
  formatForDisplay
};