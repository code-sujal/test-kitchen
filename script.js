// kitchen-display/script.js
import { db } from './firebase-config.js';
import { 
    collection, 
    onSnapshot, 
    doc,
    updateDoc,
    query,
    orderBy,
    serverTimestamp,
    addDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// --- KitchenAudioManager for notification sounds ---
class KitchenAudioManager {
    constructor() {
        this.audio = document.getElementById('notification-sound');
        this.audioEnabled = false;
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
    }

    async enableAudio() {
        try {
            if (!this.audio) {
                console.error('❌ Audio element not found');
                return;
            }

            this.audio.volume = 0.7;
            await this.audio.play();
            this.audio.pause();
            this.audio.currentTime = 0;
            this.audioEnabled = true;
            
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
            this.audio.currentTime = 0;
            const playPromise = this.audio.play();
            
            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        console.log('🔊 Notification sound played');
                    })
                    .catch(error => {
                        console.error('❌ Error playing notification:', error);
                    });
            }
        } catch (error) {
            console.error('❌ Error in playNotification:', error);
        }
    }

    testSound() {
        console.log('🧪 Testing notification sound...');
        this.playNotification();
    }
}

// --- PIN Authentication System ---
class KitchenAuth {
    constructor() {
        this.authorizedPins = {
            '1234': 'Kitchen Manager',
            '5678': 'Sr. Chef',
            '4321': 'Jr. Chef',
        };
        this.currentUser = null;
        this.setupPinLogin();
    }

    setupPinLogin() {
        const pinForm = document.getElementById('pin-login-form');
        if (pinForm) {
            pinForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handlePinLogin();
            });
        }

        // Auto-format PIN input
        const pinInput = document.getElementById('chef-pin');
        if (pinInput) {
            pinInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
            });

            // Auto-submit when PIN is 4 digits
            pinInput.addEventListener('keyup', (e) => {
                if (e.target.value.length === 4) {
                    setTimeout(() => {
                        const selectedChef = document.getElementById('chef-name').value;
                        if (selectedChef) {
                            this.handlePinLogin();
                        }
                    }, 500);
                }
            });
        }
    }

    handlePinLogin() {
        const pin = document.getElementById('chef-pin').value;
        const selectedChef = document.getElementById('chef-name').value;
        
        if (pin.length !== 4) {
            this.showLoginError('Please enter a 4-digit PIN');
            return;
        }

        if (!selectedChef) {
            this.showLoginError('Please select your name');
            return;
        }

        if (this.authorizedPins[pin]) {
            // Successful login
            this.currentUser = {
                pin: pin,
                name: this.authorizedPins[pin],
                selectedName: selectedChef,
                loginTime: new Date()
            };
            
            this.showKitchenDashboard();
            this.logAccess();
            console.log('✅ Chef logged in:', this.currentUser.name);
        } else {
            this.showLoginError('Invalid PIN. Please try again.');
            this.clearPinInput();
        }
    }

    clearPinInput() {
        document.getElementById('chef-pin').value = '';
        document.getElementById('chef-name').value = '';
    }

    showLoginError(message) {
        const errorElement = document.getElementById('login-error');
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        
        setTimeout(() => {
            errorElement.style.display = 'none';
        }, 3000);
    }

    showKitchenDashboard() {
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('kitchen-dashboard').style.display = 'block';
        
        // Display user info
        const userInfo = document.getElementById('user-info');
        if (userInfo && this.currentUser) {
            userInfo.textContent = `${this.currentUser.name}`;
        }
    }

    async logAccess() {
        try {
            // Log to Firestore for tracking
            await addDoc(collection(db, 'kitchen_access_logs'), {
                chefName: this.currentUser.name,
                selectedName: this.currentUser.selectedName,
                loginTime: new Date(),
                action: 'login'
            });
        } catch (error) {
            console.error('Failed to log access:', error);
        }
    }

    logout() {
        this.currentUser = null;
        document.getElementById('login-container').style.display = 'flex';
        document.getElementById('kitchen-dashboard').style.display = 'none';
        this.clearPinInput();
        console.log('👋 Chef logged out');
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
        this.previousOrders = [];
        this.auth = new KitchenAuth();
        
        this.init();
    }
    
    init() {
        console.log('🚀 Initializing Kitchen Display System...');
        this.setupEventListeners();
        this.startClock();
        
        // Only start order listener if user is authenticated
        if (this.auth.currentUser) {
            this.setupOrderListener();
            this.displayOrders();
        }
    }

    // Start order monitoring (called after login)
    startOrderMonitoring() {
        this.setupOrderListener();
        this.displayOrders();
    }
    
    setupOrderListener() {
        const ordersQuery = query(
            this.ordersRef,
            orderBy('timestamp', 'desc')
        );
        
        onSnapshot(ordersQuery, (snapshot) => {
            console.log('📊 Orders updated, total:', snapshot.size);
            
            this.previousOrders = [...this.orders];
            this.orders = [];
            
            const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
            
            snapshot.forEach((doc) => {
                const orderData = { id: doc.id, ...doc.data() };
                
                if (orderData.status !== 'completed' || 
                    (orderData.timestamp && orderData.timestamp.toDate() > thirtyMinutesAgo)) {
                    this.orders.push(orderData);
                }
            });
            
            this.detectNewOrders();
            this.updateOrderCounts();
            this.displayOrders();
            
        }, (error) => {
            console.error('❌ Error listening to orders:', error);
            this.showError('Failed to load orders. Please refresh.');
        });
    }
    
    detectNewOrders() {
        const currentPendingOrders = this.orders.filter(o => o.status === 'pending');
        const newOrders = currentPendingOrders.filter(currentOrder => {
            return !this.previousOrders.some(prevOrder => prevOrder.id === currentOrder.id);
        });

        const recentNewOrders = newOrders.filter(order => {
            if (!order.timestamp) return false;
            const orderTime = order.timestamp.toDate();
            const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
            return orderTime > twoMinutesAgo;
        });

        if (recentNewOrders.length > 0) {
            console.log('🆕 New orders detected:', recentNewOrders.length);
            
            if (window.audioManager) {
                window.audioManager.playNotification();
            }
            
            recentNewOrders.forEach(order => {
                this.showNewOrderNotification(order);
            });

            if ('vibrate' in navigator) {
                navigator.vibrate([200, 100, 200, 100, 200]);
            }
        }
    }
    
    updateOrderCounts() {
        this.orderCounts = {
            pending: this.orders.filter(o => o.status === 'pending').length,
            preparing: this.orders.filter(o => o.status === 'preparing').length,
            ready: this.orders.filter(o => o.status === 'ready').length,
            completed: this.orders.filter(o => o.status === 'completed').length
        };
        
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
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification('🔔 New Order Received!', {
                body: `Table ${order.tableNumber} - Order #${order.orderNumber || 'N/A'} - ₹${order.total}`,
                icon: '/favicon.ico',
                tag: order.id,
                requireInteraction: true
            });

            setTimeout(() => {
                notification.close();
            }, 10000);
        }

        this.showVisualNotification(order);
    }

    showVisualNotification(order) {
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
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }
    
    setActiveTab(status) {
        this.activeTab = status;
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeTabBtn = document.querySelector(`[data-status="${status}"]`);
        if (activeTabBtn) {
            activeTabBtn.classList.add('active');
        }
        
        this.displayOrders();
    }
    
    displayOrders() {
        const ordersGrid = document.getElementById('orders-grid');
        const emptyState = document.getElementById('empty-state');
        
        if (!ordersGrid) return;
        
        let filteredOrders = this.orders;
        
        if (this.activeTab !== 'all') {
            filteredOrders = this.orders.filter(order => order.status === this.activeTab);
        }
        
        filteredOrders.sort((a, b) => {
            const aUrgent = this.isUrgentOrder(a);
            const bUrgent = this.isUrgentOrder(b);
            
            if (aUrgent && !bUrgent) return -1;
            if (!aUrgent && bUrgent) return 1;
            
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
                [`${newStatus}At`]: serverTimestamp(),
                updatedBy: this.auth.currentUser ? this.auth.currentUser.name : 'Unknown'
            });
            
            console.log(`✅ Order ${orderId} updated to ${newStatus} by ${this.auth.currentUser?.name}`);
            
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
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
    
    closeOrderModal() {
        const modal = document.getElementById('order-modal');
        modal.classList.remove('active');
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
    
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
        
        return (order.status === 'pending' && diffMins > 15) ||
               (order.status === 'preparing' && diffMins > 30);
    }
    
    getEstimatedTime(order) {
        const baseTime = 15;
        const itemComplexity = order.items.reduce((time, item) => {
            return time + (item.quantity * 2);
        }, 0);
        
        return Math.min(baseTime + itemComplexity, 45);
    }
    
    showError(message) {
        console.error('💥 Kitchen Display Error:', message);
    }
    
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
    
    setupEventListeners() {
        // Logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.auth.logout();
            });
        }
        
        // Modal close
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
            
            if (e.key >= '1' && e.key <= '4') {
                const tabs = ['pending', 'preparing', 'ready', 'completed'];
                const tabIndex = parseInt(e.key) - 1;
                if (tabs[tabIndex]) {
                    this.setActiveTab(tabs[tabIndex]);
                }
            }

            if (e.key.toLowerCase() === 't' && window.audioManager) {
                window.audioManager.testSound();
            }
        });
        
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        // Start monitoring after successful login
        const originalShowDashboard = this.auth.showKitchenDashboard.bind(this.auth);
        this.auth.showKitchenDashboard = () => {
            originalShowDashboard();
            this.startOrderMonitoring();
        };
    }
}

// Initialize audio manager
const audioManager = new KitchenAudioManager();
window.audioManager = audioManager;

// Initialize the kitchen display
const kitchenDisplay = new KitchenDisplay();
window.kitchenDisplay = kitchenDisplay;

console.log('🚀 Kitchen Display System loaded successfully!');
