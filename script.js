// kitchen-display/script.js
import { db } from './firebase-config.js';
import { 
    collection, 
    onSnapshot, 
    doc,
    updateDoc,
    query,
    where,
    orderBy,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// --- KitchenAudioManager for notification sounds ---
class KitchenAudioManager {
    constructor() {
        this.audio = document.getElementById('notification-sound');
        this.audioEnabled = false;
        this.lastOrderCount = 0;
        this.setupAudioPermissions();
    }

    setupAudioPermissions() {
        const enableBtn = document.getElementById('enable-audio');
        
        if (enableBtn) {
            enableBtn.addEventListener('click', () => {
                this.enableAudio();
                enableBtn.style.display = 'none';
            });
        }

        // Auto-hide button if audio is already enabled
        if (this.audioEnabled) {
            if (enableBtn) enableBtn.style.display = 'none';
        }
    }

    async enableAudio() {
        try {
            if (!this.audio) {
                console.error('❌ Audio element not found');
                return;
            }

            // Play and immediately pause to unlock audio
            this.audio.volume = 0.7; // Set volume to 70%
            await this.audio.play();
            this.audio.pause();
            this.audio.currentTime = 0;
            this.audioEnabled = true;
            
            // Also request notification permission
            this.requestNotificationPermission();
            
            console.log('✅ Audio enabled successfully');
        } catch (error) {
            console.error('❌ Failed to enable audio:', error);
        }
    }

    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                console.log('📢 Notification permission:', permission);
            });
        }
    }

    playNotification() {
        if (!this.audioEnabled || !this.audio) {
            console.warn('🔇 Audio not enabled or not found');
            return;
        }

        try {
            // Reset audio to beginning
            this.audio.currentTime = 0;
            
            // Play the notification
            const playPromise = this.audio.play();
            
            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        console.log('🔊 Notification sound played');
                    })
                    .catch(error => {
                        console.error('❌ Error playing notification:', error);
                        // Fallback: try to enable audio again
                        this.enableAudio();
                    });
            }
        } catch (error) {
            console.error('❌ Error in playNotification:', error);
        }
    }

    // Test method
    testSound() {
        console.log('🧪 Testing notification sound...');
        this.playNotification();
    }
}

class KitchenDisplay {
    constructor() {
        this.restaurantId = 'restaurant_1';
        this.ordersRef = collection(db, `restaurants/${this.restaurantId}/orders`);
        this.orders = [];
        this.activeTab = 'pending';
        this.orderCounts = {
            pending: 0,
            preparing: 0,
            ready: 0,
            completed: 0
        };
        this.previousPendingCount = 0; // Track previous count for new order detection
        
        this.init();
    }
    
    init() {
        console.log('🚀 Initializing Kitchen Display System...');
        this.setupOrderListener();
        this.setupEventListeners();
        this.startClock();
        this.displayOrders();
    }
    
    // Real-time order listener
    setupOrderListener() {
        const ordersQuery = query(
            this.ordersRef,
            orderBy('timestamp', 'desc')
        );
        
        onSnapshot(ordersQuery, (snapshot) => {
            console.log('📊 Orders updated, total:', snapshot.size);
            
            // Track changes for new order detection
            const previousOrders = [...this.orders];
            this.orders = [];
            
            const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
            
            snapshot.forEach((doc) => {
                const orderData = { id: doc.id, ...doc.data() };
                
                // Include recent orders or non-completed orders
                if (orderData.status !== 'completed' || 
                    (orderData.timestamp && orderData.timestamp.toDate() > thirtyMinutesAgo)) {
                    this.orders.push(orderData);
                }
            });
            
            // Check for new orders
            this.detectNewOrders(previousOrders);
            
            this.updateOrderCounts();
            this.displayOrders();
            
        }, (error) => {
            console.error('❌ Error listening to orders:', error);
            this.showError('Failed to load orders. Please refresh.');
        });
    }
    
    // Detect new orders and trigger notifications
    detectNewOrders(previousOrders) {
        const currentPendingOrders = this.orders.filter(o => o.status === 'pending');
        const newOrders = currentPendingOrders.filter(currentOrder => {
            // Check if this order wasn't in the previous orders
            return !previousOrders.some(prevOrder => prevOrder.id === currentOrder.id);
        });

        // Only trigger notifications for truly new orders (within last 2 minutes)
        const recentNewOrders = newOrders.filter(order => {
            if (!order.timestamp) return false;
            const orderTime = order.timestamp.toDate();
            const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
            return orderTime > twoMinutesAgo;
        });

        if (recentNewOrders.length > 0) {
            console.log('🆕 New orders detected:', recentNewOrders.length);
            
            // Play notification sound
            if (window.audioManager) {
                window.audioManager.playNotification();
            }
            
            // Show browser notifications
            recentNewOrders.forEach(order => {
                this.showNewOrderNotification(order);
            });

            // Add vibration for mobile devices
            if ('vibrate' in navigator) {
                navigator.vibrate([200, 100, 200, 100, 200]);
            }
        }
    }
    
    // Update order counts in header
    updateOrderCounts() {
        this.orderCounts = {
            pending: this.orders.filter(o => o.status === 'pending').length,
            preparing: this.orders.filter(o => o.status === 'preparing').length,
            ready: this.orders.filter(o => o.status === 'ready').length,
            completed: this.orders.filter(o => o.status === 'completed').length
        };
        
        // Update header stats
        Object.keys(this.orderCounts).forEach(status => {
            const element = document.getElementById(`${status}-count`);
            if (element) {
                element.textContent = this.orderCounts[status];
            }
            
            const tabElement = document.getElementById(`tab-${status}`);
            if (tabElement) {
                tabElement.textContent = this.orderCounts[status];
            }
        });
    }
    
    showNewOrderNotification(order) {
        // Browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification('🔔 New Order Received!', {
                body: `Table ${order.tableNumber} - Order #${order.orderNumber || 'N/A'} - ₹${order.total}`,
                icon: '/favicon.ico',
                tag: order.id,
                requireInteraction: true
            });

            // Auto-close notification after 10 seconds
            setTimeout(() => {
                notification.close();
            }, 10000);
        }

        // Visual notification in the interface
        this.showVisualNotification(order);
    }

    showVisualNotification(order) {
        // Create a temporary visual notification
        const notification = document.createElement('div');
        notification.className = 'visual-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-icon">🔔</div>
                <div class="notification-text">
                    <strong>New Order!</strong><br>
                    Table ${order.tableNumber} - ₹${order.total}
                </div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }
    
    // Set active tab
    setActiveTab(status) {
        this.activeTab = status;
        
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeTabBtn = document.querySelector(`[data-status="${status}"]`);
        if (activeTabBtn) {
            activeTabBtn.classList.add('active');
        }
        
        this.displayOrders();
    }
    
    // Display orders based on active tab
    displayOrders() {
        const ordersGrid = document.getElementById('orders-grid');
        const emptyState = document.getElementById('empty-state');
        
        if (!ordersGrid) return;
        
        let filteredOrders = this.orders;
        
        // Filter by active tab
        if (this.activeTab !== 'all') {
            filteredOrders = this.orders.filter(order => order.status === this.activeTab);
        }
        
        // Sort orders by priority
        filteredOrders.sort((a, b) => {
            // Priority: urgent orders first, then by timestamp
            const aUrgent = this.isUrgentOrder(a);
            const bUrgent = this.isUrgentOrder(b);
            
            if (aUrgent && !bUrgent) return -1;
            if (!aUrgent && bUrgent) return 1;
            
            // Then by timestamp (oldest first)
            const aTime = a.timestamp ? a.timestamp.toDate() : new Date();
            const bTime = b.timestamp ? b.timestamp.toDate() : new Date();
            return aTime - bTime;
        });
        
        if (filteredOrders.length === 0) {
            ordersGrid.style.display = 'none';
            emptyState.style.display = 'block';
        } else {
            ordersGrid.style.display = 'grid';
            emptyState.style.display = 'none';
            
            ordersGrid.innerHTML = filteredOrders.map(order => 
                this.createOrderCard(order)
            ).join('');
        }
    }
    
    // Create order card HTML
    createOrderCard(order) {
        const timeAgo = this.getTimeAgo(order.timestamp);
        const timeElapsed = this.getTimeElapsed(order.timestamp);
        const isUrgent = this.isUrgentOrder(order);
        const statusClass = `status-${order.status}`;
        
        return `
            <div class="order-card ${statusClass} ${isUrgent ? 'urgent' : ''} fade-in" 
                 data-order-id="${order.id}" 
                 onclick="kitchenDisplay.showOrderDetails('${order.id}')">
                
                <div class="order-header">
                    <div class="order-info">
                        <div class="table-number">Table ${order.tableNumber}</div>
                        <div class="order-number">Order #${order.orderNumber || 'N/A'}</div>
                        <div class="order-time">${timeAgo}</div>
                    </div>
                    <div class="order-status">
                        <span class="status-badge ${statusClass}">
                            ${order.status.toUpperCase()}
                        </span>
                        <div class="time-elapsed ${isUrgent ? 'urgent' : 'normal'}">
                            ${timeElapsed}
                        </div>
                    </div>
                </div>
                
                <div class="order-items">
                    ${order.items.map(item => `
                        <div class="order-item">
                            <div class="item-details">
                                <span class="item-qty">${item.quantity}x</span>
                                <span class="item-name">${item.name}</span>
                                ${item.notes ? `<div class="item-notes">${item.notes}</div>` : ''}
                            </div>
                            <div class="item-price">₹${item.price * item.quantity}</div>
                        </div>
                    `).join('')}
                </div>
                
                ${order.specialInstructions ? `
                    <div class="special-instructions">
                        <span class="label">Special Instructions</span>
                        <span class="text">${order.specialInstructions}</span>
                    </div>
                ` : ''}
                
                <div class="order-actions" onclick="event.stopPropagation();">
                    ${this.getActionButtons(order)}
                </div>
                
                <div class="order-footer">
                    <div class="order-total">Total: ₹${order.total}</div>
                    <div class="estimated-time">Est. ${this.getEstimatedTime(order)} min</div>
                </div>
            </div>
        `;
    }
    
    // Get action buttons based on order status
    getActionButtons(order) {
        switch (order.status) {
            case 'pending':
                return `
                    <button class="action-btn btn-start" onclick="kitchenDisplay.startPreparing('${order.id}')">
                        Start Preparing
                    </button>
                    <button class="action-btn btn-details" onclick="kitchenDisplay.showOrderDetails('${order.id}')">
                        Details
                    </button>
                `;
            case 'preparing':
                return `
                    <button class="action-btn btn-ready" onclick="kitchenDisplay.markReady('${order.id}')">
                        Mark Ready
                    </button>
                    <button class="action-btn btn-details" onclick="kitchenDisplay.showOrderDetails('${order.id}')">
                        Details
                    </button>
                `;
            case 'ready':
                return `
                    <button class="action-btn btn-complete" onclick="kitchenDisplay.markCompleted('${order.id}')">
                        Order Served
                    </button>
                    <button class="action-btn btn-details" onclick="kitchenDisplay.showOrderDetails('${order.id}')">
                        Details
                    </button>
                `;
            case 'completed':
                return `
                    <button class="action-btn btn-details" onclick="kitchenDisplay.showOrderDetails('${order.id}')">
                        View Details
                    </button>
                `;
            default:
                return '';
        }
    }
    
    // Order status update methods
    async startPreparing(orderId) {
        await this.updateOrderStatus(orderId, 'preparing');
    }
    
    async markReady(orderId) {
        await this.updateOrderStatus(orderId, 'ready');
    }
    
    async markCompleted(orderId) {
        await this.updateOrderStatus(orderId, 'completed');
    }
    
    async updateOrderStatus(orderId, newStatus) {
        try {
            const orderRef = doc(this.ordersRef, orderId);
            await updateDoc(orderRef, {
                status: newStatus,
                [`${newStatus}At`]: serverTimestamp()
            });
            
            console.log(`✅ Order ${orderId} updated to ${newStatus}`);
            
            // Add visual feedback
            const orderCard = document.querySelector(`[data-order-id="${orderId}"]`);
            if (orderCard) {
                orderCard.classList.add('loading');
                setTimeout(() => {
                    orderCard.classList.remove('loading');
                }, 1000);
            }
            
        } catch (error) {
            console.error('❌ Error updating order status:', error);
            alert('Failed to update order status. Please try again.');
        }
    }
    
    // Show order details modal
    showOrderDetails(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;
        
        const modal = document.getElementById('order-modal');
        const title = document.getElementById('modal-order-title');
        const content = document.getElementById('modal-order-content');
        const actions = document.getElementById('modal-actions');
        
        title.textContent = `Order #${order.orderNumber || 'N/A'} - Table ${order.tableNumber}`;
        
        content.innerHTML = `
            <div class="order-details">
                <div class="detail-section">
                    <h4>Order Information</h4>
                    <div class="detail-grid">
                        <div><strong>Table:</strong> ${order.tableNumber}</div>
                        <div><strong>Status:</strong> <span class="status-badge status-${order.status}">${order.status.toUpperCase()}</span></div>
                        <div><strong>Time:</strong> ${order.timestamp ? order.timestamp.toDate().toLocaleString() : 'N/A'}</div>
                        <div><strong>Total:</strong> ₹${order.total}</div>
                    </div>
                </div>
                
                <div class="detail-section">
                    <h4>Items (${order.items.length})</h4>
                    <div class="modal-items">
                        ${order.items.map(item => `
                            <div class="modal-item">
                                <div class="modal-item-main">
                                    <span class="modal-item-qty">${item.quantity}x</span>
                                    <span class="modal-item-name">${item.name}</span>
                                    <span class="modal-item-price">₹${item.price * item.quantity}</span>
                                </div>
                                ${item.notes ? `<div class="modal-item-notes">${item.notes}</div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                ${order.specialInstructions ? `
                    <div class="detail-section">
                        <h4>Special Instructions</h4>
                        <div class="special-notes">${order.specialInstructions}</div>
                    </div>
                ` : ''}
            </div>
        `;
        
        actions.innerHTML = this.getActionButtons(order);
        
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    
    closeOrderModal() {
        const modal = document.getElementById('order-modal');
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    // Utility methods
    getTimeAgo(timestamp) {
        if (!timestamp) return 'Unknown time';
        
        const now = new Date();
        const orderTime = timestamp.toDate();
        const diffMs = now - orderTime;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} min ago`;
        
        const diffHours = Math.floor(diffMins / 60);
        return `${diffHours}h ${diffMins % 60}m ago`;
    }
    
    getTimeElapsed(timestamp) {
        if (!timestamp) return '0 min';
        
        const now = new Date();
        const orderTime = timestamp.toDate();
        const diffMs = now - orderTime;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        
        if (diffMins < 60) return `${diffMins} min`;
        
        const diffHours = Math.floor(diffMins / 60);
        return `${diffHours}h ${diffMins % 60}m`;
    }
    
    isUrgentOrder(order) {
        if (!order.timestamp) return false;
        
        const now = new Date();
        const orderTime = order.timestamp.toDate();
        const diffMs = now - orderTime;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        
        // Mark as urgent if pending for more than 15 minutes or preparing for more than 30 minutes
        return (order.status === 'pending' && diffMins > 15) ||
               (order.status === 'preparing' && diffMins > 30);
    }
    
    getEstimatedTime(order) {
        const baseTime = 15; // Base preparation time
        const itemComplexity = order.items.reduce((time, item) => {
            // Add time based on item complexity
            return time + (item.quantity * 2);
        }, 0);
        
        return Math.min(baseTime + itemComplexity, 45); // Max 45 minutes
    }
    
    showError(message) {
        console.error('💥 Kitchen Display Error:', message);
        // You can implement a toast notification here
    }
    
    // Clock functionality
    startClock() {
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
    }
    
    updateClock() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-IN', {
            hour12: true,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        const dateString = now.toLocaleDateString('en-IN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const timeElement = document.getElementById('current-time');
        if (timeElement) {
            timeElement.innerHTML = `${timeString}<br><small>${dateString}</small>`;
        }
    }
    
    // Event listeners
    setupEventListeners() {
        // Close modal when clicking outside
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                this.closeOrderModal();
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeOrderModal();
            }
            
            // Tab shortcuts (1-4 keys)
            if (e.key >= '1' && e.key <= '4') {
                const tabs = ['pending', 'preparing', 'ready', 'completed'];
                const tabIndex = parseInt(e.key) - 1;
                if (tabs[tabIndex]) {
                    this.setActiveTab(tabs[tabIndex]);
                }
            }

            // Test sound with 'T' key
            if (e.key.toLowerCase() === 't' && window.audioManager) {
                window.audioManager.testSound();
            }
        });
        
        // Request notification permission on page load
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }
}

// Initialize audio manager first
const audioManager = new KitchenAudioManager();
window.audioManager = audioManager; // Make globally accessible

// Initialize the kitchen display
const kitchenDisplay = new KitchenDisplay();
window.kitchenDisplay = kitchenDisplay; // Make globally accessible

console.log('🚀 Kitchen Display System loaded successfully!');
