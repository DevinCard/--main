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
    
    // Update chart - in a real implementation, you would have a chart library
    const chartEl = document.getElementById('transaction-chart');
    if (chartEl) chartEl.innerHTML = 'Chart would be displayed here';
    
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
      return transactions;
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

// Extract clean category name without emoji
function cleanCategoryName(categoryStr) {
  // If the category has a format like "emoji|Category" or "emoji Category", extract just the category name
  if (typeof categoryStr !== 'string') return 'Unknown';
  
  // Try to match "emoji|Category" format (used by goals)
  const pipeMatch = categoryStr.match(/^.+\|(.+)$/);
  if (pipeMatch) return pipeMatch[1].trim();
  
  // Try to match "emoji Category" format
  const emojiMatch = categoryStr.match(/^(\p{Emoji})\s+(.+)$/u);
  if (emojiMatch) return emojiMatch[2].trim();
  
  return categoryStr;
}

// Format currency
function formatCurrency(amount) {
  return '$' + amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
}

// Export summary as PDF in a professional bank statement format
function exportSummaryAsPDF() {
  try {
    const { jsPDF } = window.jspdf;
    
    if (!jsPDF) {
      console.error('jsPDF is not loaded');
      return;
    }
    
    // Get timeframe information
    const activeButton = document.querySelector('.time-btn.active');
    const timeframe = activeButton ? activeButton.getAttribute('data-timeframe') : '1D';
    
    // Format date range based on timeframe
    const dateRange = getDateRangeForTimeframe(timeframe);
    
    // Get totals
    const totalDeposits = document.getElementById('total-deposits').textContent;
    const totalWithdrawals = document.getElementById('total-withdrawals').textContent;
    
    // Create a new PDF (A4 size in portrait orientation)
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    // Define colors - store as separate R, G, B values
    const primaryColorR = 120;
    const primaryColorG = 168;
    const primaryColorB = 100;
    
    const secondaryColorR = 51;
    const secondaryColorG = 51;
    const secondaryColorB = 51;
    
    const lightGrayColorR = 240;
    const lightGrayColorG = 240;
    const lightGrayColorB = 240;
    
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 15;
    const usableWidth = pageWidth - (margin * 2);
    
    // Define column positions - make these available throughout the function
    const categoryWidth = 70; // Max width for category names
    const amountX = pageWidth - margin - 50; // X position for amount column
    const percentX = pageWidth - margin - 5; // X position for percentage column
    
    // Helper function to truncate text that would overflow
    function truncateText(text, maxWidth, fontSize) {
      doc.setFontSize(fontSize);
      if (doc.getStringUnitWidth(text) * fontSize / doc.internal.scaleFactor > maxWidth) {
        let truncated = text;
        while (doc.getStringUnitWidth(truncated + '...') * fontSize / doc.internal.scaleFactor > maxWidth && truncated.length > 0) {
          truncated = truncated.slice(0, -1);
        }
        return truncated + '...';
      }
      return text;
    }
    
    // Add header with Vaultly logo and statement title
    doc.setFillColor(primaryColorR, primaryColorG, primaryColorB);
    doc.rect(0, 0, pageWidth, 35, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Vaultly Financial Statement', margin, 20);
    
    // Add statement details
    doc.setFontSize(10);
    doc.text(`Statement generated on: ${new Date().toLocaleDateString()}`, pageWidth - margin, 15, { align: 'right' });
    
    // Add account summary section
    doc.setDrawColor(0);
    doc.setFillColor(lightGrayColorR, lightGrayColorG, lightGrayColorB);
    doc.roundedRect(margin, 45, usableWidth, 35, 3, 3, 'F');
    
    doc.setTextColor(secondaryColorR, secondaryColorG, secondaryColorB);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Financial Summary', margin + 5, 55);
    
    // Add timeframe and statement period
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Statement Period: ${dateRange.start} - ${dateRange.end}`, margin + 5, 65);
    doc.text(`Timeframe: ${getTimeframeLabel(timeframe)}`, margin + 5, 70);
    
    // Add summary totals on the right side
    const totalsX = pageWidth - margin - 65; // Increased space for amounts
    doc.setFont('helvetica', 'bold');
    doc.text('Total Deposits:', totalsX, 60);
    doc.text('Total Withdrawals:', totalsX, 70);
    
    // Align amounts to the right
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(76, 175, 80); // Green for deposits
    doc.text(totalDeposits, pageWidth - margin - 5, 60, { align: 'right' });
    doc.setTextColor(244, 67, 54); // Red for withdrawals
    doc.text(totalWithdrawals, pageWidth - margin - 5, 70, { align: 'right' });
    
    // Add balance (deposits - withdrawals)
    const depositAmount = parseCurrency(totalDeposits);
    const withdrawalAmount = parseCurrency(totalWithdrawals);
    const balance = depositAmount - withdrawalAmount;
    const balanceFormatted = formatCurrency(Math.abs(balance));
    
    doc.setDrawColor(secondaryColorR, secondaryColorG, secondaryColorB);
    doc.line(totalsX, 75, pageWidth - margin - 5, 75);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Net Balance:', totalsX, 83);
    if (balance >= 0) {
      doc.setTextColor(76, 175, 80); // Green
    } else {
      doc.setTextColor(244, 67, 54); // Red
    }
    doc.text((balance >= 0 ? '+' : '-') + balanceFormatted, pageWidth - margin - 5, 83, { align: 'right' });
    
    // Add deposits section
    const depositY = 95;
    doc.setFillColor(primaryColorR, primaryColorG, primaryColorB);
    doc.setDrawColor(primaryColorR, primaryColorG, primaryColorB);
    doc.setTextColor(255, 255, 255);
    doc.roundedRect(margin, depositY, usableWidth, 10, 1, 1, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DEPOSITS BY CATEGORY', margin + usableWidth/2, depositY + 7, { align: 'center' });
    
    // Add deposits table
    const depositsList = document.getElementById('deposits-list');
    const depositsItems = depositsList ? depositsList.querySelectorAll('.transaction-item') : [];
    let currentY = depositY + 20;
    
    if (depositsItems.length === 0) {
      doc.setTextColor(secondaryColorR, secondaryColorG, secondaryColorB);
      doc.setFont('helvetica', 'italic');
      doc.text('No deposits found for this period.', margin + 5, currentY);
      currentY += 10;
    } else {
      // Add table header
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(secondaryColorR, secondaryColorG, secondaryColorB);
      doc.text('Category', margin + 5, currentY);
      doc.text('Amount', amountX, currentY);
      doc.text('% of Total', percentX, currentY, { align: 'right' });
      
      currentY += 5;
      doc.setDrawColor(secondaryColorR, secondaryColorG, secondaryColorB);
      doc.line(margin, currentY, margin + usableWidth, currentY);
      currentY += 10;
      
      // Add each deposit row
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10); // Slightly smaller font for content
      
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
          
          // Truncate long category names to prevent overlap
          const truncatedCategory = truncateText(categoryName, categoryWidth, 10);
          
          doc.setFillColor(255, 255, 255); // White background
          doc.roundedRect(margin, currentY - 5, usableWidth, 8, 1, 1, 'F'); // White background for each row
          
          doc.setTextColor(secondaryColorR, secondaryColorG, secondaryColorB);
          doc.text(truncatedCategory, margin + 5, currentY);
          doc.setTextColor(76, 175, 80); // Green for deposits
          doc.text('$' + amount, amountX, currentY);
          doc.text(percentage + '%', percentX, currentY, { align: 'right' });
          
          currentY += 8; // Increased spacing between rows
          
          // Check if we need a new page
          if (currentY > pageHeight - margin * 2) {
            doc.addPage();
            currentY = margin + 10;
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(secondaryColorR, secondaryColorG, secondaryColorB);
            doc.text('DEPOSITS BY CATEGORY (continued)', margin + 5, currentY);
            currentY += 10;
            doc.setFont('helvetica', 'normal');
          }
        }
      }
    }
    
    // Add divider
    doc.setDrawColor(lightGrayColorR, lightGrayColorG, lightGrayColorB);
    doc.setLineWidth(0.5);
    doc.line(margin, currentY, margin + usableWidth, currentY);
    currentY += 15;
    
    // Add withdrawals section
    doc.setFillColor(primaryColorR, primaryColorG, primaryColorB);
    doc.setDrawColor(primaryColorR, primaryColorG, primaryColorB);
    doc.setTextColor(255, 255, 255);
    doc.roundedRect(margin, currentY, usableWidth, 10, 1, 1, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('WITHDRAWALS BY CATEGORY', margin + usableWidth/2, currentY + 7, { align: 'center' });
    
    // Add withdrawals table
    const withdrawalsList = document.getElementById('withdrawals-list');
    const withdrawalsItems = withdrawalsList ? withdrawalsList.querySelectorAll('.transaction-item') : [];
    currentY += 20;
    
    if (withdrawalsItems.length === 0) {
      doc.setTextColor(secondaryColorR, secondaryColorG, secondaryColorB);
      doc.setFont('helvetica', 'italic');
      doc.text('No withdrawals found for this period.', margin + 5, currentY);
      currentY += 10;
    } else {
      // Add table header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(secondaryColorR, secondaryColorG, secondaryColorB);
      doc.text('Category', margin + 5, currentY);
      doc.text('Amount', amountX, currentY);
      doc.text('% of Total', percentX, currentY, { align: 'right' });
      
      currentY += 5;
      doc.setDrawColor(secondaryColorR, secondaryColorG, secondaryColorB);
      doc.line(margin, currentY, margin + usableWidth, currentY);
      currentY += 10;
      
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
          
          // Truncate long category names to prevent overlap
          const truncatedCategory = truncateText(categoryName, categoryWidth, 10);
          
          doc.setFillColor(255, 255, 255); // White background
          doc.roundedRect(margin, currentY - 5, usableWidth, 8, 1, 1, 'F'); // White background for each row
          
          doc.setTextColor(secondaryColorR, secondaryColorG, secondaryColorB);
          doc.text(truncatedCategory, margin + 5, currentY);
          doc.setTextColor(244, 67, 54); // Red for withdrawals
          doc.text('$' + amount, amountX, currentY);
          doc.text(percentage + '%', percentX, currentY, { align: 'right' });
          
          currentY += 8; // Increased spacing between rows
          
          // Check if we need a new page
          if (currentY > pageHeight - margin * 2) {
            doc.addPage();
            currentY = margin + 10;
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(secondaryColorR, secondaryColorG, secondaryColorB);
            doc.text('WITHDRAWALS BY CATEGORY (continued)', margin + 5, currentY);
            currentY += 10;
            doc.setFont('helvetica', 'normal');
          }
        }
      }
    }
    
    // Add footer to all pages
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('Vaultly Financial Services', margin, pageHeight - 10);
      doc.text(`Statement generated on ${new Date().toLocaleString()}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
    }
    
    // Save the PDF
    doc.save('vaultly-financial-statement.pdf');
  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('There was an error generating the PDF. Please try again.');
  }
}

// Helper function to get date range for a timeframe
function getDateRangeForTimeframe(timeframe) {
  const endDate = new Date();
  const startDate = new Date();
  
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
    case '1Y':
      startDate.setFullYear(endDate.getFullYear() - 1);
      break;
    case 'All':
      startDate.setFullYear(endDate.getFullYear() - 10); // Arbitrary past date
      break;
    default:
      startDate.setDate(endDate.getDate() - 1);
  }
  
  return {
    start: startDate.toLocaleDateString(),
    end: endDate.toLocaleDateString()
  };
}

// Helper function to get friendly timeframe label
function getTimeframeLabel(timeframe) {
  switch(timeframe) {
    case '1D': return 'Past Day';
    case '1W': return 'Past Week';
    case '1M': return 'Past Month';
    case '3M': return 'Past 3 Months';
    case '6M': return 'Past 6 Months';
    case '1Y': return 'Past Year';
    case 'All': return 'All Time';
    default: return 'Custom';
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