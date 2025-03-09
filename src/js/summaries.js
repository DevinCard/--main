document.addEventListener('DOMContentLoaded', () => {
  // Initialize event listeners for sign out button
  const signoutBtn = document.querySelector('.signout-btn');
  if (signoutBtn) {
    signoutBtn.addEventListener('click', () => {
      localStorage.removeItem('token');
      window.location.href = '../../index.html';
    });
  }

  // Set up timeframe buttons
  setupTimeframeButtons();
  
  // Default to 1D timeframe
  loadSummaryData('1D');
  
  // Set up export button
  const exportBtn = document.getElementById('export-pdf');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportSummaryAsPDF);
  }
});

// Set up timeframe buttons
function setupTimeframeButtons() {
  const timeButtons = document.querySelectorAll('.time-btn');
  
  timeButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      // Remove active class from all buttons
      timeButtons.forEach(btn => btn.classList.remove('active'));
      
      // Add active class to clicked button
      e.target.classList.add('active');
      
      // Get timeframe from data attribute
      const timeframe = e.target.getAttribute('data-timeframe');
      
      // Load data for selected timeframe
      loadSummaryData(timeframe);
    });
  });
}

// Load summary data for the selected timeframe
async function loadSummaryData(timeframe) {
  try {
    // Show loading indicators
    document.getElementById('deposits-list').innerHTML = '<div class="loading-indicator">Loading...</div>';
    document.getElementById('withdrawals-list').innerHTML = '<div class="loading-indicator">Loading...</div>';
    
    // Reset totals
    document.getElementById('total-deposits').textContent = '$0.00';
    document.getElementById('total-withdrawals').textContent = '$0.00';
    
    // Get transactions from API
    const transactions = await api.getTransactions();
    
    if (!transactions || transactions.length === 0) {
      document.getElementById('deposits-list').innerHTML = '<div class="loading-indicator">No transactions found.</div>';
      document.getElementById('withdrawals-list').innerHTML = '<div class="loading-indicator">No transactions found.</div>';
      return;
    }
    
    // Filter transactions based on timeframe
    const filteredTransactions = filterTransactionsByTimeframe(transactions, timeframe);
    
    // Group transactions by category and type
    const { depositsByCategory, withdrawalsByCategory, totalDeposits, totalWithdrawals } = groupTransactionsByCategory(filteredTransactions);
    
    // Display deposits by category
    displayCategorySummary(depositsByCategory, 'deposits-list', totalDeposits, 'deposit');
    
    // Display withdrawals by category
    displayCategorySummary(withdrawalsByCategory, 'withdrawals-list', totalWithdrawals, 'withdrawal');
    
    // Update totals
    const totalDepositsEl = document.getElementById('total-deposits');
    if (totalDepositsEl) totalDepositsEl.textContent = formatCurrency(totalDeposits);

    const totalWithdrawalsEl = document.getElementById('total-withdrawals');
    if (totalWithdrawalsEl) totalWithdrawalsEl.textContent = formatCurrency(totalWithdrawals);

    const netTransfersEl = document.getElementById('net-transfers');
    if (netTransfersEl) netTransfersEl.textContent = formatCurrency(totalDeposits - totalWithdrawals);
    
    // Generate and display balance over time chart
    generateBalanceOverTimeChart(transactions, timeframe);
    
    // Update selected timeframe
    updateSelectedTimeframe(timeframe);
    
    // Show content since data is loaded
    const summaryContentEl = document.getElementById('summary-content');
    if (summaryContentEl) summaryContentEl.style.display = 'block';

    const loadingIndicatorEl = document.getElementById('loading-indicator');
    if (loadingIndicatorEl) loadingIndicatorEl.style.display = 'none';
  } catch (error) {
    console.error('Error loading summary data:', error);
    document.getElementById('deposits-list').innerHTML = '<div class="loading-indicator">Error loading data.</div>';
    document.getElementById('withdrawals-list').innerHTML = '<div class="loading-indicator">Error loading data.</div>';
  }
}

// Filter transactions based on the selected timeframe
function filterTransactionsByTimeframe(transactions, timeframe) {
  const now = new Date();
  const startDate = new Date();
  
  switch(timeframe) {
    case 'Daily':
      startDate.setDate(now.getDate() - 1);
      break;
    case 'Weekly':
      startDate.setDate(now.getDate() - 7);
      break;
    case 'Monthly':
      startDate.setMonth(now.getMonth() - 1);
      break;
    case '3M':
      startDate.setMonth(now.getMonth() - 3);
      break;
    case '6M':
      startDate.setMonth(now.getMonth() - 6);
      break;
    case 'YTD':
      startDate.setMonth(0); // January
      startDate.setDate(1);  // 1st day of the month
      startDate.setFullYear(now.getFullYear()); // Current year
      break;
    case 'All':
      return transactions;
    // Keep backward compatibility with old timeframe values
    case '1D':
      startDate.setDate(now.getDate() - 1);
      break;
    case '1W':
      startDate.setDate(now.getDate() - 7);
      break;
    case '1M':
      startDate.setMonth(now.getMonth() - 1);
      break;
    case '1Y':
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    default:
      startDate.setDate(now.getDate() - 1); // Default to 1 day
  }
  
  return transactions.filter(transaction => {
    const transactionDate = new Date(transaction.date);
    return transactionDate >= startDate && transactionDate <= now;
  });
}

// Group transactions by category and type
function groupTransactionsByCategory(transactions) {
  const withdrawalsByCategory = {};
  const depositsByCategory = {};
  let totalWithdrawals = 0;
  let totalDeposits = 0;

  transactions.forEach(transaction => {
    // Extract category, handling goal transactions by title
    let category = transaction.category;
    
    // Check if this is a goal-related transaction based on the title
    if (transaction.title && transaction.title.includes('Goal Contribution')) {
      // For goal contributions, try to use the category directly
      // Since we're now storing the proper category from the goal
      category = cleanCategoryName(category);
    } else if (transaction.title && transaction.title.startsWith('Refund -')) {
      // For refunds, category should already be correct from server
      category = cleanCategoryName(category);
    }
    
    // Clean the category name to remove emojis if any
    const cleanedCategory = cleanCategoryName(category);
    
    const amount = parseFloat(transaction.amount);
    
    if (transaction.type.toLowerCase() === 'deposit') {
      if (!depositsByCategory[cleanedCategory]) {
        depositsByCategory[cleanedCategory] = {
          total: 0,
          count: 0
        };
      }
      depositsByCategory[cleanedCategory].total += amount;
      depositsByCategory[cleanedCategory].count++;
      totalDeposits += amount;
    } else {
      if (!withdrawalsByCategory[cleanedCategory]) {
        withdrawalsByCategory[cleanedCategory] = {
          total: 0,
          count: 0
        };
      }
      withdrawalsByCategory[cleanedCategory].total += amount;
      withdrawalsByCategory[cleanedCategory].count++;
      totalWithdrawals += amount;
    }
  });

  return {
    depositsByCategory,
    withdrawalsByCategory,
    totalWithdrawals,
    totalDeposits
  };
}

// Helper function to extract clean category name from "emoji|name" format
function getCategoryNameFromGoal(category) {
  if (!category) {
    return 'Other';
  }
  if (category.includes('|')) {
    return category.split('|')[1];
  }
  return category;
}

// Display category summary in the container
function displayCategorySummary(categoriesData, containerId, total, type) {
  const container = document.getElementById(containerId);
  
  if (!container) return;
  
  // If no data
  if (Object.keys(categoriesData).length === 0) {
    container.innerHTML = `<div class="loading-indicator">No ${type}s found.</div>`;
    return;
  }
  
  // Sort categories by total amount (descending)
  const sortedCategories = Object.entries(categoriesData)
    .sort((a, b) => b[1].total - a[1].total);
  
  let html = '';
  
  sortedCategories.forEach(([category, data]) => {
    // Calculate percentage to 2 decimal places
    const percentage = total > 0 ? (data.total / total * 100).toFixed(2) : 0.00;
    
    // Get category name without emoji
    const categoryName = cleanCategoryName(category);
    
    html += `
      <div class="transaction-item">
        <div class="category-info">
          <div class="category-name">${categoryName}</div>
        </div>
        <div class="transaction-amount ${type}">
          ${formatCurrency(data.total)} 
          <span class="percentage">(${percentage}%)</span>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// Helper function to strip emojis from text for PDF
function stripEmojis(text) {
  if (!text) return '';
  
  // Handle non-string inputs
  if (typeof text !== 'string') {
    try {
      text = String(text || '');
    } catch (e) {
      return '';
    }
  }
  
  // Remove emoji and special characters that PDF may not handle well
  // This regex removes emoji and some other special characters
  return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    // Also replace any leftover [object Object] text
    .replace(/\[object Object\]/g, '')
    // Clean up extra spaces
    .replace(/\|\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Modified cleanCategoryName to properly handle emojis for PDF
function cleanCategoryNameForPDF(categoryStr) {
  // Handle null or undefined
  if (!categoryStr) {
    return 'Other';
  }
  
  // Handle objects
  if (typeof categoryStr === 'object') {
    try {
      if (categoryStr.name) return stripEmojis(categoryStr.name);
      if (categoryStr.title) return stripEmojis(categoryStr.title);
      if (categoryStr.category) return cleanCategoryNameForPDF(categoryStr.category);
      return 'Other';
    } catch (e) {
      return 'Other';
    }
  }
  
  // Handle strings with emoji|Category format
  if (typeof categoryStr === 'string') {
    if (categoryStr.includes('|')) {
      const parts = categoryStr.split('|');
      if (parts.length > 1 && parts[1]) {
        return parts[1].trim();
      }
    }
    
    // Strip emojis from the string
    return stripEmojis(categoryStr);
  }
  
  return 'Other';
}

// Format currency
function formatCurrency(amount) {
  // Handle different input types
  if (typeof amount === 'number') {
    return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }
  
  if (typeof amount !== 'string') {
    // Convert to string if it's not already
    amount = String(amount || 0);
  }
  
  try {
    // Remove any non-numeric characters except decimal points and negative signs
    const numericAmount = amount.replace(/[^0-9.-]+/g, '');
    return parseFloat(numericAmount).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  } catch (error) {
    console.error('Error formatting currency value in PDF:', error);
    return '$0.00'; // Return a default value if parsing fails
  }
}

// Safely convert currency string to number
function parseCurrencyToNumber(currencyStr) {
  if (typeof currencyStr === 'number') {
    return currencyStr;
  }
  
  if (typeof currencyStr !== 'string') {
    // Convert to string if it's not already
    currencyStr = String(currencyStr || 0);
  }
  
  try {
    // Remove any non-numeric characters except decimal points and negative signs
    const numericStr = currencyStr.replace(/[^0-9.-]+/g, '');
    return parseFloat(numericStr) || 0;
  } catch (error) {
    console.error('Error parsing currency value:', error);
    return 0; // Return 0 if parsing fails
  }
}

// Convert the string values to numbers safely
const depositsValue = typeof totalDeposits === 'string' 
  ? parseFloat(totalDeposits.replace(/[^0-9.-]+/g, '')) || 0
  : (typeof totalDeposits === 'number' ? totalDeposits : 0);

const withdrawalsValue = typeof totalWithdrawals === 'string'
  ? parseFloat(totalWithdrawals.replace(/[^0-9.-]+/g, '')) || 0
  : (typeof totalWithdrawals === 'number' ? totalWithdrawals : 0);

// Export summary as PDF in a professional bank statement format
function exportSummaryAsPDF() {
  try {
    // Get current selected timeframe
    const activeTimeframeBtn = document.querySelector('.time-btn.active');
    if (!activeTimeframeBtn) {
      console.error('No active timeframe button found');
      return;
    }
    const timeframe = activeTimeframeBtn.getAttribute('data-timeframe');
    
    // Load and process data - ensure they're strings
    const totalDepositsEl = document.getElementById('total-deposits');
    const totalWithdrawalsEl = document.getElementById('total-withdrawals');
    
    if (!totalDepositsEl || !totalWithdrawalsEl) {
      console.error('Could not find deposit or withdrawal elements');
      alert('Unable to generate PDF: Missing summary data. Try refreshing the page.');
      return;
    }
    
    const totalDeposits = totalDepositsEl.textContent || '$0.00';
    const totalWithdrawals = totalWithdrawalsEl.textContent || '$0.00';
    
    // Log values for debugging
    console.log('Total Deposits:', totalDeposits, typeof totalDeposits);
    console.log('Total Withdrawals:', totalWithdrawals, typeof totalWithdrawals);
    
    // Create a new PDF document
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Set document properties
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const usableWidth = pageWidth - (margin * 2);
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Define colors
    const primaryColorR = 29; const primaryColorG = 53; const primaryColorB = 87; // #1D3557
    const secondaryColorR = 69; const secondaryColorG = 123; const secondaryColorB = 157; // #457B9D
    const lightGrayColorR = 230; const lightGrayColorG = 230; const lightGrayColorB = 230;
    
    // Column positions for tables
    const categoryWidth = usableWidth * 0.5;
    const amountX = margin + categoryWidth + 10;
    const percentX = pageWidth - margin;
    
    // Define positioning for totals
    const totalsX = margin + 10;
    
    // Current Y position tracker for dynamic content placement
    let yPos = 0;
    
    // Add header
    doc.setFillColor(primaryColorR, primaryColorG, primaryColorB);
    doc.rect(0, 0, pageWidth, 35, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(255, 255, 255);
    doc.text('Vaultly Financial Summary', pageWidth / 2, 20, { align: 'center' });
    
    // Get current date for "Generated on" text
    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    // Add timeframe and date range
    let dateRange = '';
    try {
      dateRange = getDateRangeForTimeframe(timeframe);
      // Make sure it's a string, not an object
      if (typeof dateRange !== 'string') {
        dateRange = dateRange ? dateRange.toString() : '';
      }
      
      // Remove any [object Object] text if it appears
      dateRange = dateRange.replace(/\[object Object\]/g, '').trim();
    } catch (e) {
      console.error('Error formatting date range:', e);
      dateRange = '';
    }
    
    const timeframeLabel = getTimeframeLabel(timeframe);
    
    // If we have both, display them, otherwise just show the timeframe
    const periodText = dateRange ? `Period: ${timeframeLabel} (${dateRange})` : `Period: ${timeframeLabel}`;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text(periodText, pageWidth / 2, 30, { align: 'center' });
    
    // Add user info and generation date section (below the header)
    doc.setFillColor(secondaryColorR, secondaryColorG, secondaryColorB);
    doc.rect(0, 35, pageWidth, 25, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);

    // Just use "Valued Customer" for now to eliminate any object issues
    doc.text("Prepared for: Valued Customer", margin, 47);
    doc.text(`Generated on: ${formattedDate}`, pageWidth - margin, 47, { align: 'right' });
    
    // Start content after header
    yPos = 70;
    
    // Get all transactions from API
    const allTransactions = [];
    
    // Promise to load transactions
    const transactionPromise = api.getTransactions().then(transactions => {
      allTransactions.push(...transactions);
    }).catch(err => {
      console.error('Error fetching transactions:', err);
    });
    
    // Wait for transactions to load
    Promise.all([transactionPromise]).then(() => {
      // Filter transactions by timeframe
      const filteredTransactions = filterTransactionsByTimeframe(allTransactions, timeframe);
      
      // Group transactions by category and type
      const { depositsByCategory, withdrawalsByCategory, totalDeposits, totalWithdrawals } = groupTransactionsByCategory(filteredTransactions);
      
      // Categorize transactions for detailed listing
      const depositTransactionsByCategory = {};
      const withdrawalTransactionsByCategory = {};
      
      // Group all transactions by category
      filteredTransactions.forEach(transaction => {
        const categoryName = cleanCategoryName(transaction.category);
        
        if (transaction.type === 'Deposit') {
          if (!depositTransactionsByCategory[categoryName]) {
            depositTransactionsByCategory[categoryName] = [];
          }
          depositTransactionsByCategory[categoryName].push(transaction);
        } else {
          if (!withdrawalTransactionsByCategory[categoryName]) {
            withdrawalTransactionsByCategory[categoryName] = [];
          }
          withdrawalTransactionsByCategory[categoryName].push(transaction);
        }
      });
      
      // Add summary section
      doc.setFillColor(lightGrayColorR, lightGrayColorG, lightGrayColorB);
      doc.setDrawColor(150, 150, 150);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Financial Summary', margin, yPos);
      yPos += 15;
      
      // Key financial indicators
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Key Financial Indicators', margin, yPos);
      yPos += 10;
      
      // Draw light rectangle for background
      doc.setFillColor(lightGrayColorR, lightGrayColorG, lightGrayColorB);
      doc.rect(margin - 5, yPos - 5, usableWidth + 10, 40, 'F');
      
      // Format numbers with commas and specify Currency format
      function formatCurrency(amount) {
        // Handle different input types
        if (typeof amount === 'number') {
          return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
        }
        
        if (typeof amount !== 'string') {
          // Convert to string if it's not already
          amount = String(amount || 0);
        }
        
        try {
          // Remove any non-numeric characters except decimal points and negative signs
          const numericAmount = amount.replace(/[^0-9.-]+/g, '');
          return parseFloat(numericAmount).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
        } catch (error) {
          console.error('Error formatting currency value in PDF:', error);
          return '$0.00'; // Return a default value if parsing fails
        }
      }
      
      // Calculate net change
      const netChange = depositsValue - withdrawalsValue;
      const netChangeFormatted = netChange.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      const netText = netChange >= 0 ? 'Net Savings' : 'Net Spending';
      
      // Financial indicators content
      doc.setFont('helvetica', 'normal');
      const depositsFormatted = formatCurrency(totalDeposits);
      const withdrawalsFormatted = formatCurrency(totalWithdrawals);
      
      // Show the indicators with proper alignment
      doc.text('Total Income:', margin, yPos + 10);
      doc.text(depositsFormatted, pageWidth - margin, yPos + 10, { align: 'right' });
      
      doc.text('Total Expenses:', margin, yPos + 20);
      doc.text(withdrawalsFormatted, pageWidth - margin, yPos + 20, { align: 'right' });
      
      doc.text(netText + ':', margin, yPos + 30);
      doc.setFont('helvetica', 'bold');
      doc.text(netChangeFormatted, pageWidth - margin, yPos + 30, { align: 'right' });
      
      // Move y position past the box
      yPos += 50;
      
      // Add deposits section
      yPos += 10;
      doc.setFillColor(primaryColorR, primaryColorG, primaryColorB);
      doc.setDrawColor(primaryColorR, primaryColorG, primaryColorB);
      doc.setTextColor(255, 255, 255);
      doc.roundedRect(margin, yPos, usableWidth, 10, 1, 1, 'F');
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('INCOME BY CATEGORY', margin + usableWidth/2, yPos + 7, { align: 'center' });
      
      yPos += 20;
      
      // Add deposits table
      const depositsList = document.getElementById('deposits-list');
      const depositsItems = depositsList ? depositsList.querySelectorAll('.transaction-item') : [];
      
      if (depositsItems.length === 0) {
        doc.setTextColor(secondaryColorR, secondaryColorG, secondaryColorB);
        doc.setFont('helvetica', 'italic');
        doc.text('No income transactions found for this period.', margin + 5, yPos);
        yPos += 10;
      } else {
        // Add table header
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(secondaryColorR, secondaryColorG, secondaryColorB);
        doc.text('Category', margin + 5, yPos);
        doc.text('Amount', amountX, yPos);
        doc.text('% of Total', percentX, yPos, { align: 'right' });
        
        yPos += 5;
        doc.setDrawColor(secondaryColorR, secondaryColorG, secondaryColorB);
        doc.line(margin, yPos, margin + usableWidth, yPos);
        yPos += 10;
        
        // Add each deposit row
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        
        for (let i = 0; i < depositsItems.length; i++) {
          const item = depositsItems[i];
          const categoryNameElement = item.querySelector('.category-name');
          const categoryName = categoryNameElement ? categoryNameElement.textContent : 'Unknown';
          const amountText = item.querySelector('.transaction-amount').textContent.trim();
          
          // Extract amount and percentage with decimal places
          const regex = /\$([0-9,]+\.\d+)\s+\((\d+\.\d+)%\)/;
          const match = amountText.match(regex);
          
          if (match) {
            const amount = match[1];
            const percentage = match[2];
            
            // Process category name to ensure emojis and [object Object] are removed
            const cleanedCategory = cleanCategoryNameForPDF(categoryName);
            
            // Truncate long category names to prevent overlap
            const truncatedCategory = truncateText(cleanedCategory, categoryWidth, 10);
            
            doc.setFillColor(255, 255, 255); // White background
            doc.roundedRect(margin, yPos - 5, usableWidth, 8, 1, 1, 'F'); // White background for each row
            
            doc.setTextColor(secondaryColorR, secondaryColorG, secondaryColorB);
            doc.text(truncatedCategory, margin + 5, yPos);
            doc.setTextColor(76, 175, 80); // Green for deposits
            doc.text('$' + amount, amountX, yPos);
            doc.text(percentage + '%', percentX, yPos, { align: 'right' });
            
            yPos += 8; // Increased spacing between rows
            
            // Add a page if needed before listing transactions
            if (yPos > pageHeight - 40) {
              doc.addPage();
              yPos = margin;
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(secondaryColorR, secondaryColorG, secondaryColorB);
              doc.text('INCOME BY CATEGORY (continued)', margin + 5, yPos);
              yPos += 15;
              doc.setFont('helvetica', 'normal');
            }
            
            // Add transactions for this category (limit to 3 per category to save space)
            if (depositTransactionsByCategory[categoryName] && depositTransactionsByCategory[categoryName].length > 0) {
              const transactionsToShow = depositTransactionsByCategory[categoryName].slice(0, 3);
              
              doc.setFontSize(8);
              doc.setTextColor(100, 100, 100);
              
              for (const transaction of transactionsToShow) {
                // Format date
                const transDate = new Date(transaction.date);
                const formattedDate = transDate.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric'
                });
                
                // Format description
                const title = safeString(transaction.title || 'Income');
                const truncatedTitle = truncateText(title, 120, 8);
                
                doc.text(`${formattedDate} - ${truncatedTitle} - $${parseFloat(transaction.amount || 0).toFixed(2)}`, margin + 15, yPos);
                yPos += 5;
              }
              
              // Show count of additional transactions if more than 3
              if (depositTransactionsByCategory[categoryName].length > 3) {
                doc.text(`... and ${depositTransactionsByCategory[categoryName].length - 3} more transactions`, margin + 15, yPos);
                yPos += 5;
              }
              
              yPos += 3; // Add space after transactions
            }
            
            // Check if we need a new page
            if (yPos > pageHeight - 40) {
              doc.addPage();
              yPos = margin;
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(secondaryColorR, secondaryColorG, secondaryColorB);
              doc.text('INCOME BY CATEGORY (continued)', margin + 5, yPos);
              yPos += 15;
              doc.setFont('helvetica', 'normal');
            }
          }
        }
      }
      
      // Add divider
      doc.setDrawColor(lightGrayColorR, lightGrayColorG, lightGrayColorB);
      doc.setLineWidth(0.5);
      doc.line(margin, yPos, margin + usableWidth, yPos);
      yPos += 15;
      
      // Check if we need a new page for withdrawals section
      if (yPos > pageHeight - 60) {
        doc.addPage();
        yPos = margin;
      }
      
      // Add withdrawals section
      doc.setFillColor(primaryColorR, primaryColorG, primaryColorB);
      doc.setDrawColor(primaryColorR, primaryColorG, primaryColorB);
      doc.setTextColor(255, 255, 255);
      doc.roundedRect(margin, yPos, usableWidth, 10, 1, 1, 'F');
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('EXPENSES BY CATEGORY', margin + usableWidth/2, yPos + 7, { align: 'center' });
      
      yPos += 20;
      
      // Add withdrawals table
      const withdrawalsList = document.getElementById('withdrawals-list');
      const withdrawalsItems = withdrawalsList ? withdrawalsList.querySelectorAll('.transaction-item') : [];
      
      if (withdrawalsItems.length === 0) {
        doc.setTextColor(secondaryColorR, secondaryColorG, secondaryColorB);
        doc.setFont('helvetica', 'italic');
        doc.text('No expense transactions found for this period.', margin + 5, yPos);
        yPos += 10;
      } else {
        // Add table header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(secondaryColorR, secondaryColorG, secondaryColorB);
        doc.text('Category', margin + 5, yPos);
        doc.text('Amount', amountX, yPos);
        doc.text('% of Total', percentX, yPos, { align: 'right' });
        
        yPos += 5;
        doc.setDrawColor(secondaryColorR, secondaryColorG, secondaryColorB);
        doc.line(margin, yPos, margin + usableWidth, yPos);
        yPos += 10;
        
        // Add each withdrawal row
        doc.setFont('helvetica', 'normal');
        
        for (let i = 0; i < withdrawalsItems.length; i++) {
          const item = withdrawalsItems[i];
          const categoryNameElement = item.querySelector('.category-name');
          const categoryName = categoryNameElement ? categoryNameElement.textContent : 'Unknown';
          const amountText = item.querySelector('.transaction-amount').textContent.trim();
          
          // Extract amount and percentage with decimal places
          const regex = /\$([0-9,]+\.\d+)\s+\((\d+\.\d+)%\)/;
          const match = amountText.match(regex);
          
          if (match) {
            const amount = match[1];
            const percentage = match[2];
            
            // Process category name to ensure emojis and [object Object] are removed
            const cleanedCategory = cleanCategoryNameForPDF(categoryName);
            
            // Truncate long category names to prevent overlap
            const truncatedCategory = truncateText(cleanedCategory, categoryWidth, 10);
            
            doc.setFillColor(255, 255, 255); // White background
            doc.roundedRect(margin, yPos - 5, usableWidth, 8, 1, 1, 'F'); // White background for each row
            
            doc.setTextColor(secondaryColorR, secondaryColorG, secondaryColorB);
            doc.text(truncatedCategory, margin + 5, yPos);
            doc.setTextColor(244, 67, 54); // Red for withdrawals
            doc.text('$' + amount, amountX, yPos);
            doc.text(percentage + '%', percentX, yPos, { align: 'right' });
            
            yPos += 8; // Increased spacing between rows
            
            // Add a page if needed before listing transactions
            if (yPos > pageHeight - 40) {
              doc.addPage();
              yPos = margin;
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(secondaryColorR, secondaryColorG, secondaryColorB);
              doc.text('EXPENSES BY CATEGORY (continued)', margin + 5, yPos);
              yPos += 15;
              doc.setFont('helvetica', 'normal');
            }
            
            // Add transactions for this category (limit to 3 per category to save space)
            if (withdrawalTransactionsByCategory[categoryName] && withdrawalTransactionsByCategory[categoryName].length > 0) {
              const transactionsToShow = withdrawalTransactionsByCategory[categoryName].slice(0, 3);
              
              doc.setFontSize(8);
              doc.setTextColor(100, 100, 100);
              
              for (const transaction of transactionsToShow) {
                // Format date
                const transDate = new Date(transaction.date);
                const formattedDate = transDate.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric'
                });
                
                // Format description
                const title = safeString(transaction.title || 'Expense');
                const truncatedTitle = truncateText(title, 120, 8);
                
                doc.text(`${formattedDate} - ${truncatedTitle} - $${parseFloat(transaction.amount || 0).toFixed(2)}`, margin + 15, yPos);
                yPos += 5;
              }
              
              // Show count of additional transactions if more than 3
              if (withdrawalTransactionsByCategory[categoryName].length > 3) {
                doc.text(`... and ${withdrawalTransactionsByCategory[categoryName].length - 3} more transactions`, margin + 15, yPos);
                yPos += 5;
              }
              
              yPos += 3; // Add space after transactions
            }
            
            // Check if we need a new page
            if (yPos > pageHeight - 40) {
              doc.addPage();
              yPos = margin;
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(secondaryColorR, secondaryColorG, secondaryColorB);
              doc.text('EXPENSES BY CATEGORY (continued)', margin + 5, yPos);
              yPos += 15;
              doc.setFont('helvetica', 'normal');
            }
          }
        }
      }
      
      // Add footer with page numbers and branding to all pages
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        doc.text(`Vaultly Financial Report - Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
      }
      
      // Save the PDF with a more descriptive filename that includes timeframe and date
      const timeframeTxt = timeframe.replace(/\s/g, '_').toLowerCase();
      const today = new Date().toISOString().slice(0, 10);
      doc.save(`vaultly_financial_summary_${timeframeTxt}_${today}.pdf`);
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Failed to generate PDF. Please try again later.');
  }
}

// Helper function to truncate text to fit within a specified width
function truncateText(text, maxWidth, fontSize) {
  // Ensure text is a string
  if (text === null || text === undefined) {
    return '';
  }
  
  // Convert to string if not already
  if (typeof text !== 'string') {
    try {
      text = String(text);
    } catch (e) {
      return '';
    }
  }
  
  // Replace any [object Object] with empty string
  text = text.replace(/\[object Object\]/g, '');
  
  // If text is empty after processing, return empty string
  if (!text.trim()) {
    return '';
  }
  
  // Rough estimate: Each character is ~0.6 times the font size in width
  const charWidth = fontSize * 0.6;
  const maxChars = Math.floor(maxWidth / charWidth);
  
  if (text.length <= maxChars) {
    return text;
  }
  
  return text.substring(0, maxChars - 3) + '...';
}

// Helper function to get date range for a timeframe
function getDateRangeForTimeframe(timeframe) {
  if (!timeframe || typeof timeframe !== 'string') {
    return 'All time';
  }
  
  const endDate = new Date();
  const startDate = new Date();
  
  try {
    switch(timeframe) {
      case '1D':
        startDate.setDate(endDate.getDate() - 1);
        break;
      case '1W':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '1M':
        startDate.setMonth(endDate.getMonth() - 1);
        break;
      case '3M':
        startDate.setMonth(endDate.getMonth() - 3);
        break;
      case '6M':
        startDate.setMonth(endDate.getMonth() - 6);
        break;
      case 'YTD':
        startDate.setMonth(0);
        startDate.setDate(1);
        break;
      case '1Y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      case 'All':
      case 'ALL':
        startDate.setFullYear(endDate.getFullYear() - 10); // Arbitrary past date
        return 'All time';
      default:
        startDate.setMonth(endDate.getMonth() - 3); // Default to 3 months
    }
    
    // Format dates as clean strings
    const startDateStr = startDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    const endDateStr = endDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    return `${startDateStr} - ${endDateStr}`;
  } catch (e) {
    console.error('Error formatting date range:', e);
    return '';
  }
}

// Get a human-readable label for a timeframe
function getTimeframeLabel(timeframe) {
  if (!timeframe || typeof timeframe !== 'string') {
    return 'All Time';
  }
  
  switch(timeframe.toUpperCase()) {
    case 'DAY': return 'Today';
    case 'WEEK': return 'This Week';
    case 'MONTH': return 'This Month';
    case 'QUARTER': return 'This Quarter';
    case 'YEAR': return 'This Year';
    case 'YTD': return 'Year to Date';
    case '1D': return 'Last 24 Hours';
    case '7D': return 'Last 7 Days';
    case '30D': return 'Last 30 Days';
    case '90D': return 'Last 90 Days';
    case '1Y': return 'Last 12 Months';
    case 'ALL': return 'All Time';
    default: return timeframe; // Return the timeframe itself if no match
  }
}

// Helper function to parse currency string to number
function parseCurrency(currencyStr) {
  if (!currencyStr) return 0;
  return parseFloat(currencyStr.replace(/[$,]/g, '')) || 0;
}

// Update selected timeframe
function updateSelectedTimeframe(timeframe) {
    // Remove active class from all timeframe buttons
    const timeframeButtons = document.querySelectorAll('.timeframe-button');
    if (timeframeButtons && timeframeButtons.length) {
        timeframeButtons.forEach(button => button.classList.remove('active'));
    }
    
    // Add active class to selected timeframe button
    const selectedButton = document.querySelector(`.timeframe-button[data-timeframe="${timeframe}"]`);
    if (selectedButton) {
        selectedButton.classList.add('active');
    }
    
    // Update the timeframe label
    const timeframeLabel = document.getElementById('selected-timeframe');
    if (timeframeLabel) {
        timeframeLabel.textContent = getTimeframeLabel(timeframe);
    }
}

// Display Withdrawals by Category
function displayWithdrawalCategories(withdrawalsByCategory, totalWithdrawals) {
  // Implementation of displayWithdrawalCategories function
}

// Display Deposits by Category
function displayDepositCategories(depositsByCategory, totalDeposits) {
  // Implementation of displayDepositCategories function
}

// Process transactions based on timeframe
function processTransactionsForTimeframe(allTransactions, timeframe) {
    const filteredTransactions = filterTransactionsByTimeframe(allTransactions, timeframe);
    
    // Group transactions by category
    const { depositsByCategory, withdrawalsByCategory, totalDeposits, totalWithdrawals } = groupTransactionsByCategory(filteredTransactions);
    
    // Display summary info
    displaySummaryInfo(depositsByCategory, withdrawalsByCategory, totalDeposits, totalWithdrawals, timeframe);
    
    return filteredTransactions;
}

// Function to generate balance over time chart
function generateBalanceOverTimeChart(transactions, timeframe) {
  // Get the container element
  const chartContainer = document.getElementById('transaction-chart');
  if (!chartContainer) return;
  
  // Sort transactions by date (oldest first)
  const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Filter transactions based on the selected timeframe
  const filteredTransactions = filterTransactionsByTimeframe(sortedTransactions, timeframe);
  
  // If no transactions, show a message
  if (filteredTransactions.length === 0) {
    chartContainer.innerHTML = '<div class="no-data-message">No transactions available for the selected period.</div>';
    return;
  }
  
  // Group transactions by date and calculate cumulative balance
  const dataByDate = {};
  let runningBalance = 0;
  
  // First, calculate the starting balance from all transactions before the timeframe
  const startDate = getTimeframeStartDate(timeframe);
  
  // Calculate initial balance from transactions before the start date
  const initialTransactions = sortedTransactions.filter(t => new Date(t.date) < startDate);
  initialTransactions.forEach(transaction => {
    const amount = parseFloat(transaction.amount);
    if (transaction.type === 'Deposit') {
      runningBalance += amount;
    } else if (transaction.type === 'Withdrawal') {
      runningBalance -= amount;
    }
  });
  
  // Add starting point at the beginning of the timeframe
  dataByDate[startDate.toISOString().split('T')[0]] = runningBalance;
  
  // Process filtered transactions to create the chart data
  filteredTransactions.forEach(transaction => {
    const date = new Date(transaction.date);
    const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD format
    const amount = parseFloat(transaction.amount);
    
    // Update running balance
    if (transaction.type === 'Deposit') {
      runningBalance += amount;
    } else if (transaction.type === 'Withdrawal') {
      runningBalance -= amount;
    }
    
    // Store the running balance for this date
    dataByDate[dateString] = runningBalance;
  });
  
  // Add today's date with the final balance if it's not already included
  const today = new Date();
  const todayString = today.toISOString().split('T')[0];
  if (!dataByDate[todayString] && today > startDate) {
    dataByDate[todayString] = runningBalance;
  }
  
  // Get all dates in the range (for more frequent data points)
  const allDates = [];
  const endDate = new Date();
  let currentDate = new Date(startDate);
  
  // Determine the interval for data points based on timeframe
  let interval = 1; // Default to daily points
  if (timeframe === 'Monthly' || timeframe === '3M') {
    interval = 3; // Show points every 3 days
  } else if (timeframe === '6M' || timeframe === 'YTD') {
    interval = 7; // Show points weekly
  }
  
  // Generate all dates in the range
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    allDates.push(dateStr);
    currentDate.setDate(currentDate.getDate() + interval);
  }
  
  // Sort all dates
  allDates.sort();
  
  // Fill in the gaps between transaction dates by interpolating
  const dates = Object.keys(dataByDate).sort();
  for (let i = 0; i < dates.length - 1; i++) {
    const currentDate = new Date(dates[i]);
    const nextDate = new Date(dates[i + 1]);
    const currentBalance = dataByDate[dates[i]];
    const nextBalance = dataByDate[dates[i + 1]];
    
    // Find dates between two transaction dates
    for (const dateStr of allDates) {
      const date = new Date(dateStr);
      if (date > currentDate && date < nextDate && !dataByDate[dateStr]) {
        // Interpolate balance based on position between dates
        const totalDays = (nextDate - currentDate) / (1000 * 60 * 60 * 24);
        const daysPassed = (date - currentDate) / (1000 * 60 * 60 * 24);
        const ratio = daysPassed / totalDays;
        const interpolatedBalance = currentBalance + (nextBalance - currentBalance) * ratio;
        dataByDate[dateStr] = interpolatedBalance;
      }
    }
  }
  
  // Convert to arrays for Chart.js
  const finalDates = Object.keys(dataByDate).sort();
  const balances = finalDates.map(date => dataByDate[date]);
  
  // Split data into positive and negative balances for different styling
  const positiveBalances = balances.map(balance => balance >= 0 ? balance : null);
  const negativeBalances = balances.map(balance => balance < 0 ? balance : null);
  
  // Clear previous chart if any
  chartContainer.innerHTML = '<canvas id="balance-chart"></canvas>';
  const canvas = document.getElementById('balance-chart');
  
  // Create the chart with improved styling
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: finalDates.map(date => formatDateForDisplay(date, timeframe)),
      datasets: [
        {
          label: 'Positive Balance',
          data: positiveBalances,
          backgroundColor: 'rgba(75, 192, 125, 0.2)', // Green for positive balance
          borderColor: 'rgba(75, 192, 125, 1)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: 'rgba(75, 192, 125, 1)',
          pointBorderColor: '#fff',
          pointBorderWidth: 1,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: 'rgba(75, 192, 125, 1)',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          tension: 0.3, // Smoothes the line a bit
          fill: true
        },
        {
          label: 'Negative Balance',
          data: negativeBalances,
          backgroundColor: 'rgba(255, 99, 132, 0.2)', // Red for negative balance
          borderColor: 'rgba(255, 99, 132, 1)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: 'rgba(255, 99, 132, 1)',
          pointBorderColor: '#fff',
          pointBorderWidth: 1,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: 'rgba(255, 99, 132, 1)',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          tension: 0.3,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: 'Balance Over Time',
          font: {
            size: 16,
            weight: 'bold'
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: function(context) {
              const value = context.raw;
              if (value !== null) {
                return `Balance: ${formatCurrency(value)}`;
              }
              return '';
            }
          }
        },
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          title: {
            display: true,
            text: 'Date',
            ticks: {
              maxTicksLimit: 10 // Limit number of x-axis labels to avoid crowding
            }
          },
        },
        y: {
          grid: {
            color: 'rgba(200, 200, 200, 0.2)'
          },
          title: {
            display: true,
            text: 'Balance ($)'
          },
          ticks: {
            callback: function(value) {
              return formatCurrency(value);
            }
          }
        }
      }
    }
  });
}

// Helper function to get the start date for a timeframe
function getTimeframeStartDate(timeframe) {
  const now = new Date();
  const startDate = new Date();
  
  switch(timeframe) {
    case '1D':
      startDate.setDate(now.getDate() - 1);
      break;
    case '1W':
      startDate.setDate(now.getDate() - 7);
      break;
    case '1M':
      startDate.setMonth(now.getMonth() - 1);
      break;
    case '3M':
      startDate.setMonth(now.getMonth() - 3);
      break;
    case '6M':
      startDate.setMonth(now.getMonth() - 6);
      break;
    case '1Y':
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    case 'All':
      startDate.setFullYear(2000); // A date far in the past
      break;
    default:
      startDate.setDate(now.getDate() - 1); // Default to 1 day
  }
  
  return startDate;
}

// Helper function to format date for display on chart axis
function formatDateForDisplay(dateString, timeframe) {
  const date = new Date(dateString);
  
  switch(timeframe) {
    case '1D':
    case '1W':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case '1M':
    case '3M':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case '6M':
    case '1Y':
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    case 'All':
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    default:
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

// Helper function to safely convert any value to a string for PDF display
function safeString(value) {
  if (value === null || value === undefined) {
    return '';
  }
  
  if (typeof value === 'string') {
    return value.replace(/\[object Object\]/g, '');
  }
  
  if (typeof value === 'object') {
    try {
      // Try to use a meaningful representation if possible
      if (value.toString && value.toString() !== '[object Object]') {
        return value.toString();
      }
      return JSON.stringify(value);
    } catch (e) {
      return '';
    }
  }
  
  return String(value);
}

// Function to clean category names for display (not for PDF)
function cleanCategoryName(categoryStr) {
  // Handle null, undefined, or non-string values
  if (!categoryStr) {
    return 'Other';
  }
  
  // Handle objects that got converted to strings
  if (typeof categoryStr === 'object') {
    try {
      // Try to extract a meaningful name
      if (categoryStr.name) return categoryStr.name;
      if (categoryStr.title) return categoryStr.title;
      if (categoryStr.category) return cleanCategoryName(categoryStr.category);
      return 'Other';
    } catch (e) {
      return 'Other';
    }
  }
  
  // If it's already a string but contains [object Object], replace it
  if (typeof categoryStr === 'string' && categoryStr.includes('[object Object]')) {
    return 'Other';
  }
  
  // Normal string processing
  if (typeof categoryStr === 'string' && categoryStr.includes('|')) {
    const parts = categoryStr.split('|');
    if (parts.length > 1) {
      return parts[1].trim(); // Return the category name part
    }
  }
  
  return categoryStr.toString ? categoryStr.toString() : 'Other';
} 