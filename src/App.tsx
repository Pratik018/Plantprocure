/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy,
  addDoc,
  updateDoc,
  setDoc,
  doc,
  serverTimestamp,
  Timestamp,
  getDocs,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { 
  Plus, 
  Search, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  LogOut, 
  LayoutDashboard, 
  ShoppingCart, 
  FileCheck, 
  CreditCard,
  ChevronRight,
  Menu,
  X,
  ShieldCheck,
  User as UserIcon,
  Filter,
  Check,
  CheckSquare,
  FileDown,
  FileSpreadsheet,
  Settings,
  Users,
  Trash2,
  Archive,
  Activity,
  Bell,
  BellRing,
  Trash,
  MessageCircle,
  Send,
  UserCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInDays } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import { auth, db, signIn, signOut, handleFirestoreError, OperationType } from './lib/firebase';
import { Procurement, ProcurementStatus } from './types';

type NotificationType = 'STATUS_CHANGE' | 'NEW_REQUEST' | 'INFO';

interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  procurementId?: string;
  isRead: boolean;
  createdAt: any;
}

// Safe date parsing for Firestore Timestamps or ISO strings
const parseDate = (d: any): Date => {
  if (!d) return new Date();
  if (d instanceof Timestamp) return d.toDate();
  if (typeof d.toDate === 'function') return d.toDate();
  const date = new Date(d);
  return isNaN(date.getTime()) ? new Date() : date;
};

// Admin email from metadata/user info
const BOOTSTRAP_ADMIN_EMAIL = "impratikpatra@gmail.com";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authorizedUsers, setAuthorizedUsers] = useState<{id: string, email: string, role?: 'USER' | 'ADMIN'}[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'request' | 'admin' | 'tracking' | 'purchase' | 'approval' | 'ledger' | 'settings'>('dashboard');
  const [procurements, setProcurements] = useState<Procurement[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [adminUids, setAdminUids] = useState<string[]>([]);

  // Custom Alert/Confirm State
  const [dialog, setDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    type: 'alert' | 'confirm';
    onConfirm?: () => void;
  }>({ show: false, title: '', message: '', type: 'alert' });

  const showAlert = (message: string, title: string = 'Notice') => {
    setDialog({ show: true, title, message, type: 'alert' });
  };

  const showConfirm = (message: string, onConfirm: () => void, title: string = 'Confirm') => {
    setDialog({ show: true, title, message, type: 'confirm', onConfirm });
  };

  useEffect(() => {
    let unsubscribeAuthorized: (() => void) | null = null;
    
    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      
      if (u) {
        // Update user profile in Firestore
        try {
          await setDoc(doc(db, 'users', u.uid), {
            email: u.email,
            displayName: u.displayName || 'User',
            lastLogin: serverTimestamp()
          }, { merge: true });
        } catch (err) {
          console.error("Error updating user profile:", err);
        }

        // Fallback for bootstrap admin
        const isBootstrap = u.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
        
        // Setup real-time listener for access control
        const authDocRef = doc(db, 'authorized_users', u.email?.toLowerCase() || 'unknown');

        if (unsubscribeAuthorized) unsubscribeAuthorized();
        unsubscribeAuthorized = onSnapshot(authDocRef, (authSnap) => {
          const authData = authSnap.data();
          const isEmailAdmin = authData?.role === 'ADMIN';
          const isEmailAuthorized = authSnap.exists();

          setIsAdmin(isBootstrap || isEmailAdmin);
          setIsAuthorized(isBootstrap || isEmailAuthorized);
          setLoading(false);
        }, (err) => {
          console.error("Auth doc error:", err);
          setIsAdmin(isBootstrap);
          setIsAuthorized(isBootstrap);
          setLoading(false);
        });
      } else {
        setIsAdmin(false);
        setIsAuthorized(false);
        setLoading(false);
        if (unsubscribeAuthorized) unsubscribeAuthorized();
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeAuthorized) unsubscribeAuthorized();
    };
  }, []);

  // Fetch all authorized users for management
  useEffect(() => {
    if (!isAdmin) {
      setAuthorizedUsers([]);
      return;
    }

    const qAuth = query(collection(db, 'authorized_users'), orderBy('email'));
    const unsubscribeAuth = onSnapshot(qAuth, (snapshot) => {
      setAuthorizedUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    });

    return () => {
      unsubscribeAuth();
    };
  }, [isAdmin]);

  const sendNotification = async (recipientId: string, title: string, message: string, type: NotificationType, procurementId?: string) => {
    try {
      await addDoc(collection(db, 'notifications'), {
        userId: recipientId,
        title,
        message,
        type,
        procurementId,
        isRead: false,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error sending notification:", err);
    }
  };

  useEffect(() => {
    if (!user || !isAuthorized) return;
    
    const fetchAdminUids = async () => {
      try {
        const adminsQuery = query(collection(db, 'authorized_users'), where('role', '==', 'ADMIN'));
        const adminSnaps = await getDocs(adminsQuery);
        const adminEmails = adminSnaps.docs.map(d => d.data().email.toLowerCase());
        
        if (!adminEmails.includes(BOOTSTRAP_ADMIN_EMAIL.toLowerCase())) {
          adminEmails.push(BOOTSTRAP_ADMIN_EMAIL.toLowerCase());
        }

        // Limit to 10 for 'in' query
        const topEmails = adminEmails.slice(0, 10);
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', 'in', topEmails));
        const userSnaps = await getDocs(q);
        setAdminUids(userSnaps.docs.map(d => d.id));
      } catch (err) {
        console.error("Error fetching admin UIDs:", err);
      }
    };

    fetchAdminUids();
  }, [user, isAuthorized]);

  useEffect(() => {
    if (!user || !isAuthorized) return;

    // All authorized users can now see all procurements for tracking and lifecycle management
    const q = query(collection(db, 'procurements'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Procurement[];
      setProcurements(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'procurements');
    });

    return () => unsubscribe();
  }, [user, isAuthorized]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center"
        >
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldCheck className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">PlantProcure Ledger</h1>
          <p className="text-slate-500 mb-8">Sign in to manage your plant procurement requests and payments.</p>
          <button
            onClick={signIn}
            className="w-full flex items-center justify-center gap-3 bg-slate-900 text-white rounded-xl py-3 font-medium hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
          >
            <div className="w-5 h-5 bg-white text-slate-900 rounded flex items-center justify-center text-[10px] font-black">G</div>
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center"
        >
          <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-rose-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Restricted</h1>
          <p className="text-slate-500 mb-6 font-medium">
            Your account <span className="text-slate-900 font-bold">({user.email})</span> is not authorized to access this system.
          </p>
          <div className="bg-slate-50 rounded-xl p-4 mb-8 text-sm text-slate-600 text-left">
            <p className="font-bold mb-1">How to gain access:</p>
            <p>Please contact an administrator for authorisation. Once added to the system, you will be able to access all features.</p>
          </div>
          <button
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-2 bg-slate-200 text-slate-700 rounded-xl py-3 font-medium hover:bg-slate-300 transition-colors"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
            <LayoutDashboard className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-slate-900">PlantProcure</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-600">
            {isSidebarOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      {/* Sidebar/Navigation */}
      <aside className={`
        fixed md:static inset-0 z-40 bg-white border-r border-slate-200 w-72 transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="flex flex-col h-full p-6">
          <div className="hidden md:flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200">
              <LayoutDashboard className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">PlantProcure</h1>
          </div>

          <nav className="flex-1 space-y-1">
            <NavItem 
              active={activeTab === 'dashboard'} 
              onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }}
              icon={<LayoutDashboard size={18} />}
              label="Dashboard"
            />
            <NavItem 
              active={activeTab === 'request'} 
              onClick={() => { setActiveTab('request'); setIsSidebarOpen(false); }}
              icon={<Plus size={18} />}
              label="New Request"
            />
            <NavItem 
              active={activeTab === 'tracking'} 
              onClick={() => { setActiveTab('tracking'); setIsSidebarOpen(false); }}
              icon={<Search size={18} />}
              label="Track Status"
            />
            {isAdmin && (
              <>
                <NavItem 
                  active={activeTab === 'admin'} 
                  onClick={() => { setActiveTab('admin'); setIsSidebarOpen(false); }}
                  icon={<ShieldCheck size={18} />}
                  label="Admin Review"
                  badge={procurements.filter(p => p.status === 'REQUESTED' || p.status === 'PENDING').length}
                />
                <NavItem 
                  active={activeTab === 'settings'} 
                  onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }}
                  icon={<Settings size={18} />}
                  label="Admin Settings"
                />
              </>
            )}
            <NavItem 
              active={activeTab === 'purchase'} 
              onClick={() => { setActiveTab('purchase'); setIsSidebarOpen(false); }}
              icon={<ShoppingCart size={18} />}
              label="Purchase Entry"
              badge={procurements.filter(p => p.status === 'APPROVED').length}
            />
            <NavItem 
              active={activeTab === 'approval'} 
              onClick={() => { setActiveTab('approval'); setIsSidebarOpen(false); }}
              icon={<FileCheck size={18} />}
              label="Approval Note"
              badge={procurements.filter(p => p.status === 'PURCHASED').length}
            />
            <NavItem 
              active={activeTab === 'ledger'} 
              onClick={() => { setActiveTab('ledger'); setIsSidebarOpen(false); }}
              icon={<CreditCard size={18} />}
              label="Payment Ledger"
              badge={procurements.filter(p => p.status === 'NOTE_APPROVED').length}
            />
          </nav>

          <div className="pt-6 border-t border-slate-100">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 mb-4 shadow-sm">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center border border-emerald-200">
                {user.photoURL ? (
                  <img src={user.photoURL} className="w-8 h-8 rounded-full" alt="" referrerPolicy="no-referrer" />
                ) : (
                  <UserIcon size={16} className="text-emerald-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate tracking-tight">{user.displayName}</p>
                <div className="flex items-center gap-1.5">
                   <div className={`w-1.5 h-1.5 rounded-full ${isAdmin ? 'bg-indigo-500' : 'bg-emerald-500'}`} />
                   <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{isAdmin ? 'Admin' : 'Requester'}</p>
                </div>
              </div>
            </div>
            <button 
              onClick={signOut}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors group"
            >
              <LogOut size={18} className="group-hover:translate-x-0.5 transition-transform" />
              <span className="text-sm font-medium">Log out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-10 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          {/* Desktop Top Bar */}
          <div className="hidden md:flex items-center justify-between mb-10">
            <h1 className="text-2xl font-bold text-slate-900 capitalize tracking-tight">
              {activeTab === 'dashboard' ? 'Overview' : activeTab.replace(/([A-Z])/g, ' $1').trim()}
            </h1>
            <div className="flex items-center gap-4">
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && <Dashboard procurements={procurements} setActiveTab={setActiveTab} isAdmin={isAdmin} />}
              {activeTab === 'request' && <RequestForm user={user} showAlert={showAlert} sendNotification={sendNotification} adminUids={adminUids} />}
              {activeTab === 'tracking' && <TrackingDashboard procurements={procurements} />}
              {activeTab === 'admin' && <AdminReview procurements={procurements} isAdmin={isAdmin} showAlert={showAlert} showConfirm={showConfirm} sendNotification={sendNotification} />}
              {activeTab === 'purchase' && <PurchaseEntry procurements={procurements} user={user} showAlert={showAlert} showConfirm={showConfirm} sendNotification={sendNotification} adminUids={adminUids} />}
              {activeTab === 'approval' && <ApprovalStatus procurements={procurements} sendNotification={sendNotification} adminUids={adminUids} user={user} />}
              {activeTab === 'ledger' && <PaymentLedger procurements={procurements} sendNotification={sendNotification} adminUids={adminUids} user={user} />}
              {activeTab === 'settings' && isAdmin && <AdminManagement authorizedUsers={authorizedUsers} showAlert={showAlert} showConfirm={showConfirm} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Custom Dialog Modal */}
      <AnimatePresence>
        {dialog.show && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => dialog.type === 'alert' && setDialog(prev => ({ ...prev, show: false }))}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 text-center">
                <div className={`w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center ${dialog.type === 'confirm' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  {dialog.type === 'confirm' ? <AlertCircle size={24} /> : <CheckCircle2 size={24} />}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{dialog.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{dialog.message}</p>
              </div>
              <div className="p-4 bg-slate-50 flex gap-3">
                {dialog.type === 'confirm' && (
                  <button 
                    onClick={() => setDialog(prev => ({ ...prev, show: false }))}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                )}
                <button 
                  onClick={() => {
                    if (dialog.onConfirm) dialog.onConfirm();
                    setDialog(prev => ({ ...prev, show: false }));
                  }}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-200/50 transition-all ${dialog.type === 'confirm' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                >
                  {dialog.type === 'confirm' ? 'Confirm' : 'Continue'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ChatMessenger user={user} isAdmin={isAdmin} showAlert={showAlert} showConfirm={showConfirm} />
    </div>
  );
}

interface Message {
  id: string;
  senderId: string;
  senderEmail?: string;
  senderName?: string;
  text: string;
  chatId: string;
  createdAt: any;
  isAdminMessage: boolean;
  isRead: boolean;
}

function ChatMessenger({ user, isAdmin, showAlert, showConfirm }: { user: User, isAdmin: boolean, showAlert: any, showConfirm: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedChatUser, setSelectedChatUser] = useState<{ uid: string, email: string, displayName?: string } | null>(null);
  const [chatUsers, setChatUsers] = useState<{ uid: string, email: string, displayName?: string, unreadCount?: number }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);

  // If common user, chatId is their own UID
  const currentChatId = isAdmin ? (selectedChatUser?.uid || null) : user.uid;

  const deleteMessage = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'messages', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `messages/${id}`);
    }
  };

  const clearChat = async () => {
    if (!currentChatId || messages.length === 0) return;

    showConfirm(
      "Are you sure you want to clear all messages in this chat? This action cannot be undone.",
      async () => {
        try {
          const batch = writeBatch(db);
          messages.forEach(m => {
            batch.delete(doc(db, 'messages', m.id));
          });
          await batch.commit();
          showAlert("Chat cleared successfully.");
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'messages/batch-delete');
        }
      },
      "Clear Chat"
    );
  };

  // Scroll to bottom when messages change or chat opens
  useEffect(() => {
    if (isOpen && currentChatId) {
      const chatEnd = document.getElementById('chat-end');
      if (chatEnd) {
        chatEnd.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages, isOpen, currentChatId]);

  // Listen to total unread messages to show on the main button
  useEffect(() => {
    const q = query(
      collection(db, 'messages'),
      where(isAdmin ? 'isAdminMessage' : 'chatId', '==', isAdmin ? false : user.uid),
      where('isRead', '==', false)
    );

    // If common user, also need to filter by their chatId (which we handled by the where above)
    // For admins, we want all unread messages from any common user.
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (isAdmin) {
        setTotalUnreadCount(snapshot.docs.length);
      } else {
        // For common users, only count if isAdminMessage is true
        const unreadCount = snapshot.docs.filter(d => d.data().isAdminMessage === true).length;
        setTotalUnreadCount(unreadCount);
      }
    });

    return () => unsubscribe();
  }, [isAdmin, user.uid]);

  // Mark current chat messages as read when viewed
  useEffect(() => {
    if (!isOpen || !currentChatId || messages.length === 0) return;

    const unreadMessages = messages.filter(m => 
      !m.isRead && (isAdmin ? !m.isAdminMessage : m.isAdminMessage)
    );

    if (unreadMessages.length === 0) return;

    const markBatchAsRead = async () => {
      const batch = writeBatch(db);
      unreadMessages.forEach(m => {
        batch.update(doc(db, 'messages', m.id), { isRead: true });
      });
      try {
        await batch.commit();
      } catch (err) {
        console.error("Error marking messages as read:", err);
      }
    };

    markBatchAsRead();
  }, [isOpen, currentChatId, messages, isAdmin]);

  // Listen to messages for the current chat
  useEffect(() => {
    if (!currentChatId || !isOpen) return;

    const q = query(
      collection(db, 'messages'),
      where('chatId', '==', currentChatId),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)));
    });

    return () => unsubscribe();
  }, [currentChatId, isOpen]);

  // For admins: fetch users and their unread counts
  useEffect(() => {
    if (!isAdmin || !isOpen || selectedChatUser) return;

    setLoadingUsers(true);
    
    // Listen to all unread messages from users to update counts in real-time
    const qUnread = query(
      collection(db, 'messages'),
      where('isAdminMessage', '==', false),
      where('isRead', '==', false)
    );

    const unsubUnread = onSnapshot(qUnread, (unreadSnap) => {
      const unreadByChatId: Record<string, number> = {};
      unreadSnap.docs.forEach(d => {
        const cid = d.data().chatId;
        unreadByChatId[cid] = (unreadByChatId[cid] || 0) + 1;
      });

      const fetchUsers = async () => {
        try {
          // Get unique chatIds from all messages
          const msgSnap = await getDocs(query(collection(db, 'messages'), orderBy('createdAt', 'desc')));
          const uniqueChatIds = Array.from(new Set(msgSnap.docs.map(d => d.data().chatId)));
          
          const usersRef = collection(db, 'users');
          const users: any[] = [];
          
          for (const uid of uniqueChatIds) {
            const uSnap = await getDocs(query(usersRef, where('__name__', '==', uid)));
            if (!uSnap.empty) {
              const data = uSnap.docs[0].data();
              users.push({ 
                uid, 
                email: data.email, 
                displayName: data.displayName,
                unreadCount: unreadByChatId[uid as string] || 0
              });
            }
          }
          
          // Add other registered users
          const authUsersSnap = await getDocs(collection(db, 'authorized_users'));
          for (const docUser of authUsersSnap.docs) {
            const email = docUser.data().email;
            if (!users.find(u => u.email === email)) {
              const uq = query(usersRef, where('email', '==', email));
              const uSnap = await getDocs(uq);
              if (!uSnap.empty) {
                const uid = uSnap.docs[0].id;
                users.push({ 
                  uid, 
                  email, 
                  displayName: uSnap.docs[0].data().displayName,
                  unreadCount: unreadByChatId[uid] || 0
                });
              }
            }
          }

          setChatUsers(users);
        } catch (err) {
          console.error("Error fetching chat users:", err);
        } finally {
          setLoadingUsers(false);
        }
      };

      fetchUsers();
    });

    return () => unsubUnread();
  }, [isAdmin, isOpen, selectedChatUser]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentChatId) return;

    const messageText = newMessage.trim();
    setNewMessage('');

    try {
      await addDoc(collection(db, 'messages'), {
        senderId: user.uid,
        senderEmail: user.email,
        senderName: user.displayName,
        text: messageText,
        chatId: currentChatId,
        isAdminMessage: isAdmin,
        isRead: false,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'messages');
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="mb-4 w-80 md:w-96 h-[500px] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-100"
          >
            {/* Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center">
                  <MessageCircle size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-sm tracking-tight">
                    {isAdmin 
                      ? (selectedChatUser ? `Chat with ${selectedChatUser.displayName || selectedChatUser.email}` : 'Select a User')
                      : 'Support Chat'}
                  </h4>
                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">
                    {isAdmin && selectedChatUser ? 'User Message Interface' : 'Online'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {isAdmin && selectedChatUser && messages.length > 0 && (
                   <button 
                    onClick={clearChat}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/70 hover:text-rose-400"
                    title="Clear Chat"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                {isAdmin && selectedChatUser && (
                  <button 
                    onClick={() => setSelectedChatUser(null)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/70 hover:text-white"
                  >
                    <X size={16} />
                  </button>
                )}
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <ChevronRight size={20} className="rotate-90" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-4 chat-messages-container">
              {isAdmin && !selectedChatUser ? (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Conversations</p>
                  {loadingUsers ? (
                    <div className="flex justify-center py-10">
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        className="w-6 h-6 border-2 border-slate-300 border-t-emerald-500 rounded-full"
                      />
                    </div>
                  ) : chatUsers.length === 0 ? (
                    <p className="text-center text-slate-400 py-10 text-sm">No registered users found.</p>
                  ) : (
                    chatUsers.map(u => (
                      <button
                        key={u.uid}
                        onClick={() => setSelectedChatUser(u)}
                        className="w-full flex items-center gap-3 p-3 bg-white rounded-2xl border border-slate-100 hover:border-emerald-200 hover:shadow-md transition-all text-left"
                      >
                        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center border border-slate-200 text-slate-500">
                          <UserCircle size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-900 text-sm truncate">{u.displayName || u.email}</p>
                          <p className="text-[10px] text-slate-500 truncate lowercase">{u.email}</p>
                        </div>
                        {u.unreadCount ? (
                          <div className="bg-rose-500 text-white min-w-[20px] h-5 rounded-full flex items-center justify-center px-1.5 shadow-sm shadow-rose-200">
                            <span className="text-[10px] font-black">{u.unreadCount}</span>
                          </div>
                        ) : (
                          <ChevronRight size={16} className="text-slate-300" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <>
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-60">
                      <div className="w-16 h-16 bg-slate-200 rounded-2xl flex items-center justify-center text-slate-400">
                        <MessageCircle size={32} />
                      </div>
                      <p className="text-sm text-slate-500 max-w-[200px]">Send a message to start the conversation.</p>
                    </div>
                  ) : (
                    messages.map((msg, i) => {
                      const isMe = msg.senderId === user.uid;
                      const showSender = !isMe && (isAdmin && !msg.isAdminMessage);
                      const canDelete = isMe || isAdmin;

                      return (
                        <div key={msg.id} className={`flex group/msg ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            {showSender && i === 0 && (
                              <span className="text-[10px] font-bold text-slate-400 ml-1 mb-1">{msg.senderName || msg.senderEmail}</span>
                            )}
                            <div className="flex items-end gap-2 group">
                              {isMe && canDelete && (
                                <button 
                                  onClick={() => deleteMessage(msg.id)}
                                  className="opacity-0 group-hover/msg:opacity-100 p-1 text-slate-300 hover:text-rose-500 transition-all"
                                  title="Delete message"
                                >
                                  <Trash size={12} />
                                </button>
                              )}
                              <div className={`rounded-2xl p-3 px-4 shadow-sm ${
                                isMe 
                                  ? 'bg-emerald-600 text-white rounded-tr-none' 
                                  : 'bg-white text-slate-900 rounded-tl-none border border-slate-100'
                              }`}>
                                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                                <p className={`text-[9px] mt-1.5 font-medium opacity-60 ${isMe ? 'text-right' : 'text-left'}`}>
                                  {format(parseDate(msg.createdAt), 'HH:mm')}
                                </p>
                              </div>
                              {!isMe && canDelete && (
                                <button 
                                  onClick={() => deleteMessage(msg.id)}
                                  className="opacity-0 group-hover/msg:opacity-100 p-1 text-slate-300 hover:text-rose-500 transition-all"
                                  title="Delete message"
                                >
                                  <Trash size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div id="chat-end" />
                </>
              )}
            </div>

            {/* Input */}
            {(!isAdmin || selectedChatUser) && (
              <form onSubmit={sendMessage} className="p-4 bg-white border-t border-slate-100 flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 bg-slate-50 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim()}
                  className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center hover:bg-emerald-700 disabled:opacity-50 disabled:bg-slate-300 transition-all shadow-lg shadow-emerald-200"
                >
                  <Send size={18} />
                </button>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-slate-900 text-white rounded-2xl shadow-xl shadow-slate-200 flex items-center justify-center hover:scale-110 active:scale-95 transition-all relative group"
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
        {totalUnreadCount > 0 && !isOpen && (
          <div className="absolute -top-1 -right-1 bg-rose-500 text-white min-w-[22px] h-5 px-1.5 rounded-full border-2 border-slate-50 flex items-center justify-center shadow-lg shadow-rose-200 z-10 animate-bounce">
            <span className="text-[10px] font-black leading-none">{totalUnreadCount}</span>
          </div>
        )}
        {!isOpen && totalUnreadCount === 0 && (
          <div className="absolute -top-2 -right-2 bg-emerald-500 w-4 h-4 rounded-full border-4 border-slate-50 animate-pulse" />
        )}
        <div className="absolute right-full mr-4 bg-white px-3 py-1.5 rounded-lg border border-slate-100 shadow-sm opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap">
          <p className="text-xs font-bold text-slate-900 italic">
            {totalUnreadCount > 0 ? `${totalUnreadCount} New ${totalUnreadCount === 1 ? 'Message' : 'Messages'}` : `Chat with ${isAdmin ? 'Users' : 'Admins'}`}
          </p>
        </div>
      </button>
    </div>
  );
}

function NavItem({ active, onClick, icon, label, badge }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, badge?: number }) {
  return (
    <button 
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
        ${active ? 'bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100/50' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}
      `}
    >
      <span className={`${active ? 'text-emerald-600' : 'text-slate-400'}`}>{icon}</span>
      <span className="text-sm font-medium flex-1 text-left">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${active ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

// --- Tab Components ---

function Dashboard({ procurements, setActiveTab, isAdmin }: { procurements: Procurement[], setActiveTab: any, isAdmin: boolean }) {
  const stats = [
    { 
      label: 'Admin Review', 
      count: procurements.filter(p => ['REQUESTED', 'PENDING'].includes(p.status)).length,
      icon: <ShieldCheck size={20} />,
      color: 'amber',
      tab: isAdmin ? 'admin' : 'tracking',
      show: true
    },
    { 
      label: 'Purchase Entry', 
      count: procurements.filter(p => p.status === 'APPROVED').length,
      icon: <ShoppingCart size={20} />,
      color: 'emerald',
      tab: 'purchase',
      show: true
    },
    { 
      label: 'Approval Note', 
      count: procurements.filter(p => p.status === 'PURCHASED').length,
      icon: <CheckSquare size={20} />,
      color: 'indigo',
      tab: 'approval',
      show: true
    },
    { 
      label: 'Payment Pending', 
      count: procurements.filter(p => p.status === 'NOTE_APPROVED').length,
      icon: <CreditCard size={20} />,
      color: 'purple',
      tab: 'ledger',
      show: true
    }
  ].filter(s => s.show);

  const totalActive = procurements.filter(p => p.status !== 'PAYMENT_DONE' && p.status !== 'REJECTED').length;
  const recentItems = procurements.slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Overview Dashboard</h2>
        <p className="text-slate-500">Real-time status of your procurement pipeline</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.button
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            onClick={() => setActiveTab(stat.tab as any)}
            className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all text-left flex flex-col gap-4 group"
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-${stat.color}-50 text-${stat.color}-600 group-hover:scale-110 transition-transform`}>
              {stat.icon}
            </div>
            <div>
              <p className="text-3xl font-black text-slate-900">{stat.count}</p>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">{stat.label}</p>
            </div>
          </motion.button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Clock className="text-amber-500" size={18} />
              Recent Activities
            </h3>
            <button onClick={() => setActiveTab('tracking')} className="text-xs font-bold text-emerald-600 hover:underline">View All</button>
          </div>
          
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
            {recentItems.length === 0 ? (
              <div className="p-8 text-center text-slate-400 italic">No recent activities found</div>
            ) : (
              recentItems.map((p, i) => (
                <div key={p.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{p.itemDescription}</p>
                    <p className="text-[10px] text-slate-500 font-medium">Requested by {p.requestName || p.userName}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={p.status} />
                    <p className="text-[10px] text-slate-400">{format(parseDate(p.createdAt), 'MMM d, p')}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Archive className="text-indigo-500" size={18} />
            Pipeline Health
          </h3>
          <div className="bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl shadow-slate-200">
             <div className="absolute top-0 right-0 p-8 opacity-20">
                <LayoutDashboard size={120} />
             </div>
             <div className="relative z-10">
                <p className="text-emerald-400 text-sm font-bold uppercase tracking-widest mb-1">Active Pipeline</p>
                <p className="text-5xl font-black mb-4">{totalActive}</p>
                <p className="text-slate-400 text-xs leading-relaxed max-w-[200px]">
                  Total items currently being processed across all stages.
                </p>
                <button 
                  onClick={() => setActiveTab('request')}
                  className="mt-6 flex items-center gap-2 bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 transition-all"
                >
                  <Plus size={16} />
                  New Request
                </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RequestForm({ user, showAlert, sendNotification, adminUids }: { user: User, showAlert: (m: string, t?: string) => void, sendNotification: any, adminUids: string[] }) {
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    requestName: user.displayName || '',
    itemDescription: '',
    quantity: 0,
    unit: '',
    estCost: 0,
    purpose: '',
    priority: 'Medium' as Procurement['priority']
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, 'procurements'), {
        ...formData,
        userId: user.uid,
        userName: user.displayName,
        requestDate: new Date().toISOString(),
        status: 'REQUESTED',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      // Notify all admins
      for (const adminUid of adminUids) {
        if (adminUid === user.uid) continue;
        await sendNotification(
          adminUid,
          'New Procurement Request',
          `${user.displayName} has submitted a new request for ${formData.itemDescription}.`,
          'NEW_REQUEST',
          docRef.id
        );
      }

      setFormData({
        requestName: user.displayName || '',
        itemDescription: '',
        quantity: 0,
        unit: '',
        estCost: 0,
        purpose: '',
        priority: 'Medium'
      });
      showAlert('Your purchase request has been submitted and is awaiting review.', 'Request Received');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'procurements');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-8 py-6 bg-slate-50 border-b border-slate-200">
        <h2 className="text-xl font-bold text-slate-900">Purchase Request</h2>
        <p className="text-sm text-slate-500">Initiate a new procurement request</p>
      </div>
      <form onSubmit={handleSubmit} className="p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField label="Requestor Name" value={formData.requestName} onChange={v => setFormData({...formData, requestName: v})} placeholder="Your Name" required />
          <FormField label="Priority" type="select" options={['Low', 'Medium', 'High', 'Urgent']} value={formData.priority} onChange={v => setFormData({...formData, priority: v as any})} />
          <div className="md:col-span-2">
            <FormField label="Item Description" type="textarea" value={formData.itemDescription} onChange={v => setFormData({...formData, itemDescription: v})} placeholder="Detailed description of the plant or item needed" required />
          </div>
          <FormField label="Quantity" type="number" value={formData.quantity} onChange={v => setFormData({...formData, quantity: parseFloat(v) || 0})} required />
          <FormField label="Unit" value={formData.unit} onChange={v => setFormData({...formData, unit: v})} placeholder="e.g. Nos, kg, Ltr" required />
          <FormField label="Estimated Cost" type="number" value={formData.estCost} onChange={v => setFormData({...formData, estCost: parseFloat(v) || 0})} required />
          <FormField label="Purpose" value={formData.purpose} onChange={v => setFormData({...formData, purpose: v})} placeholder="Reason for request" required />
        </div>
        <div className="flex justify-end pt-4">
          <button 
            type="submit" 
            disabled={submitting}
            className="flex items-center gap-2 bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50 shadow-lg shadow-emerald-100"
          >
            {submitting ? 'Submitting...' : 'Submit Request'}
            <ChevronRight size={18} />
          </button>
        </div>
      </form>
    </div>
  );
}

function AdminReview({ procurements, isAdmin, showAlert, showConfirm, sendNotification }: { 
  procurements: Procurement[], 
  isAdmin: boolean,
  showAlert: (m: string, t?: string) => void,
  showConfirm: (m: string, oc: () => void, t?: string) => void,
  sendNotification: any
}) {
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkRemarks, setBulkRemarks] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  
  // Date filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filterProcurements = (items: Procurement[]) => {
    return items.filter(p => {
      const matchesSearch = 
        p.itemDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.requestName || p.userName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.vendorName || '').toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchesDate = true;
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        matchesDate = matchesDate && new Date(p.requestDate) >= start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchesDate = matchesDate && new Date(p.requestDate) <= end;
      }
      
      return matchesSearch && matchesDate;
    });
  };

  const pendingRequests = filterProcurements(procurements.filter(p => ['REQUESTED', 'PENDING'].includes(p.status)));
  const reviewHistory = filterProcurements(procurements.filter(p => ['APPROVED', 'REJECTED', 'PURCHASED', 'NOTE_APPROVED', 'PAYMENT_DONE'].includes(p.status)));

  const exportToCSV = () => {
    try {
      const filteredProcurements = filterProcurements(procurements);
      
      if (filteredProcurements.length === 0) {
        showAlert('No records found for the selected filters.', 'Filter Empty');
        return;
      }

      const headers = [
        'Date',
        'Requester',
        'Plant/Section',
        'Item Description',
        'Quantity',
        'Unit',
        'Expected Rate',
        'Total Amount',
        'Vendor',
        'Status',
        'Bulk ID',
        'Closing Date'
      ].join(',');

      const rows = filteredProcurements.map(p => {
        return [
          new Date(p.requestDate).toLocaleDateString(),
          `"${(p.requestName || p.userName || 'N/A').replace(/"/g, '""')}"`,
          `"${(p.plantName || 'N/A').replace(/"/g, '""')}"`,
          `"${p.itemDescription.replace(/"/g, '""')}"`,
          p.qty,
          p.unit,
          p.expectedRate,
          p.qty * p.expectedRate,
          `"${(p.vendorName || 'N/A').replace(/"/g, '""')}"`,
          p.status,
          `"${(p.bulkId || 'N/A').replace(/"/g, '""')}"`,
          p.closingDate ? new Date(p.closingDate).toLocaleDateString() : 'N/A'
        ].join(',');
      }).join('\n');

      const csvContent = "data:text/csv;charset=utf-8," + headers + '\n' + rows;
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `procurement_data_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('CSV Export Error:', error);
      showAlert('Failed to export CSV. Please try again.', 'Export Error');
    }
  };

  const exportToPDF = () => {
    try {
      const filteredProcurements = filterProcurements(procurements);
      
      if (filteredProcurements.length === 0) {
        showAlert('No records found for the selected filters.', 'Filter Empty');
        return;
      }

      const doc = new jsPDF('l', 'mm', 'a4'); // Landscape for more columns
      
      // Title
      doc.setFontSize(22);
      doc.setTextColor(79, 70, 229); // Indigo
      doc.text("Procurement Report", 14, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Generated on: ${format(new Date(), 'PPP p')}`, 14, 28);
      
      if (startDate || endDate) {
        doc.text(`Range: ${startDate || 'Any'} to ${endDate || 'Any'}`, 14, 33);
      }
      
      // Stats
      doc.setTextColor(0);
      doc.text(`Filtered Records: ${filteredProcurements.length}`, 14, 38);
      doc.text(`Pending: ${filteredProcurements.filter(p => ['REQUESTED', 'PENDING'].includes(p.status)).length}`, 80, 38);
      
      const head = [[
        'Item Description', 
        'Requester', 
        'Status', 
        'Requested', 
        'Purchased', 
        'Appr. Note', 
        'Payment',
        'Vendor Name',
        'Actual Cost'
      ]];

      const data = filteredProcurements.map(p => [
        p.itemDescription,
        p.requestName || p.userName || 'N/A',
        p.status,
        format(parseDate(p.requestDate), 'MMM d, yy'),
        p.purchaseDate ? format(parseDate(p.purchaseDate), 'MMM d, yy') : '-',
        p.approvalNoteDate ? format(parseDate(p.approvalNoteDate), 'MMM d, yy') : '-',
        p.paymentDate ? format(parseDate(p.paymentDate), 'MMM d, yy') : '-',
        p.vendorName || '-',
        p.actualCost ? `Rs. ${p.actualCost}` : '-'
      ]);

      autoTable(doc, {
        head: head,
        body: data,
        startY: 45,
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229], fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 50 }, // Item Description
          1: { cellWidth: 30 }, // Requester
        }
      });

      doc.save(`Procurement_Detailed_Report_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
      showAlert('The detailed report has been generated and downloaded.', 'Export Successful');
    } catch (error) {
      console.error('PDF Export Error:', error);
      showAlert('Failed to generate PDF. Check console for details.', 'Export Error');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const selectAll = () => {
    if (selectedIds.length === pendingRequests.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pendingRequests.map(p => p.id));
    }
  };

  const handleAction = async (id: string, status: ProcurementStatus, remarks: string) => {
    setUpdating(id);
    try {
      const p = procurements.find(item => item.id === id);
      await updateDoc(doc(db, 'procurements', id), {
        status,
        adminRemarks: remarks,
        updatedAt: serverTimestamp()
      });

      if (p) {
        await sendNotification(
          p.userId,
          `Request Status Update`,
          `Your request for ${p.itemDescription} has been ${status.toLowerCase()}.`,
          'STATUS_CHANGE',
          id
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `procurements/${id}`);
    } finally {
      setUpdating(null);
    }
  };

  const handleBulkAction = async (status: ProcurementStatus) => {
    if (selectedIds.length === 0) return;
    
    showConfirm(`Are you sure you want to ${status.toLowerCase()} ${selectedIds.length} items?`, async () => {
      setUpdating('BULK');
      try {
        const batch = writeBatch(db);
        selectedIds.forEach(id => {
          batch.update(doc(db, 'procurements', id), {
            status,
            adminRemarks: bulkRemarks,
            updatedAt: serverTimestamp()
          });
        });
        await batch.commit();

        // Notify users
        for (const id of selectedIds) {
          const p = procurements.find(item => item.id === id);
          if (p) {
            await sendNotification(
              p.userId,
              `Item Request Update`,
              `Your request for ${p.itemDescription} has been ${status.toLowerCase()}.`,
              'STATUS_CHANGE',
              id
            );
          }
        }

        setSelectedIds([]);
        setBulkRemarks('');
        showAlert(`${selectedIds.length} items have been updated to ${status}.`, 'Bulk Update Success');
      } catch (error) {
        console.error('Bulk Action error:', error);
        showAlert('The bulk action failed. Please try again.', 'Update Error');
      } finally {
        setUpdating(null);
      }
    }, 'Confirm Bulk Action');
  };

  if (!isAdmin) {
    return <div className="text-center py-20 bg-white rounded-3xl border border-slate-200">
      <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
      <h3 className="text-lg font-bold text-slate-900">Access Denied</h3>
      <p className="text-slate-500">Only administrators can view and manage requests.</p>
    </div>;
  }

  const resetData = async () => {
    setShowConfirmReset(false);
    setUpdating('ALL');
    try {
      console.log('Admin Reset: Starting process...');
      const snapshot = await getDocs(collection(db, 'procurements'));
      console.log(`Admin Reset: Found ${snapshot.size} records.`);
      
      if (snapshot.empty) {
        console.log('Admin Reset: No records to delete.');
        showAlert('The procurement database is already empty.', 'Database Empty');
        return;
      }

      console.log(`Admin Reset: Batch deleting in chunks of 50...`);
      const batchSize = 50;
      const docs = snapshot.docs;
      let totalDeleted = 0;

      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + batchSize);
        chunk.forEach(d => batch.delete(doc(db, 'procurements', d.id)));
        await batch.commit();
        totalDeleted += chunk.length;
        console.log(`Admin Reset Progress: ${totalDeleted}/${docs.length}`);
      }

      showAlert(`All ${totalDeleted} procurement records have been successfully cleared.`, 'Reset Successful');
    } catch (e: any) {
      console.error('Admin Reset Final Error:', e);
      showAlert(`Clear data failed: ${e.message || String(e)}`, 'Reset Error');
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Admin Dashboard</h2>
          <p className="text-slate-500">Overview of all procurement lifecycles</p>
          <div className="mt-1 flex items-center gap-2">
             <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold uppercase">Admin Active</span>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">Search Items/Requester</span>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 rounded-xl text-xs font-medium border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white shadow-sm w-48 md:w-64"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">From Request Date</span>
            <input 
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 rounded-xl text-xs font-medium border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white shadow-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">To Request Date</span>
            <input 
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 rounded-xl text-xs font-medium border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white shadow-sm"
            />
          </div>
          
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all border border-emerald-100 shadow-sm h-[38px]"
          >
            <FileSpreadsheet size={16} />
            CSV
          </button>

          <button 
            onClick={exportToPDF}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all border border-indigo-100 shadow-sm h-[38px]"
          >
            <FileDown size={16} />
            PDF
          </button>

          {(startDate || endDate || searchQuery) && (
            <button 
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setSearchQuery('');
              }}
              className="h-[38px] px-3 py-2 hover:bg-rose-50 text-rose-600 font-bold text-[10px] uppercase tracking-wider transition-colors rounded-xl flex items-center gap-1.5"
            >
              <X size={12} />
              Reset Filters
            </button>
          )}

          {showConfirmReset ? (
            <div className="flex items-center gap-2 bg-rose-50 p-1 rounded-xl border border-rose-200 animate-in fade-in slide-in-from-right-4">
               <span className="text-xs font-bold text-rose-700 px-2">Are you sure?</span>
               <button 
                onClick={resetData}
                className="bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-700"
               >
                Yes, Clear All
               </button>
               <button 
                onClick={() => setShowConfirmReset(false)}
                className="bg-white text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200"
               >
                Cancel
               </button>
            </div>
          ) : (
            <button 
              onClick={() => setShowConfirmReset(true)}
              disabled={updating === 'ALL'}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white transition-all border border-rose-100 shadow-sm disabled:opacity-50"
            >
              <X size={16} />
              Reset All Data
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="text-amber-500" size={20} />
            <h3 className="text-lg font-bold text-slate-800">Pending Requests</h3>
            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
              {pendingRequests.length}
            </span>
          </div>
          {pendingRequests.length > 0 && (
             <button 
              onClick={selectAll}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5"
             >
               <CheckSquare size={14} />
               {selectedIds.length === pendingRequests.length ? 'Deselect All' : 'Select All'}
             </button>
          )}
        </div>

        {/* Bulk Action Bar */}
        <AnimatePresence>
          {selectedIds.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.9 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-slate-700 flex flex-col md:flex-row items-center gap-4 min-w-[320px] md:min-w-[600px]"
            >
              <div className="flex items-center gap-3 pr-4 md:border-r border-slate-700">
                 <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-xs font-bold">
                    {selectedIds.length}
                 </div>
                 <div>
                    <p className="text-xs font-bold">Items Selected</p>
                    <p className="text-[10px] text-slate-400">Bulk action mode active</p>
                 </div>
              </div>
              
              <div className="flex-1 w-full md:w-auto">
                 <input 
                  type="text" 
                  placeholder="Bulk remarks (optional)..."
                  className="w-full bg-slate-800 border-none rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
                  value={bulkRemarks}
                  onChange={e => setBulkRemarks(e.target.value)}
                 />
              </div>

              <div className="flex items-center gap-2">
                 <button 
                  onClick={() => handleBulkAction('APPROVED')}
                  disabled={updating === 'BULK'}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors"
                 >
                   Approve
                 </button>
                 <button 
                  onClick={() => handleBulkAction('PENDING')}
                  disabled={updating === 'BULK'}
                  className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors"
                 >
                   Pending
                 </button>
                 <button 
                  onClick={() => handleBulkAction('REJECTED')}
                  disabled={updating === 'BULK'}
                  className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors"
                 >
                   Reject
                 </button>
                 <button 
                  onClick={() => setSelectedIds([])}
                  className="text-slate-400 hover:text-white p-2"
                 >
                   <X size={16} />
                 </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {pendingRequests.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center border border-slate-200 border-dashed">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3 opacity-50" />
            <p className="text-slate-400">No new requests awaiting review</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {pendingRequests.map(p => (
              <AdminCard 
                key={p.id} 
                item={p} 
                onAction={handleAction} 
                loading={updating === p.id}
                isSelected={selectedIds.includes(p.id)}
                onSelect={() => toggleSelect(p.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="pt-10 border-t border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck className="text-emerald-500" size={20} />
          <h3 className="text-lg font-bold text-slate-800">Review History</h3>
          <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">
            {reviewHistory.length}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reviewHistory.length === 0 ? (
            <div className="md:col-span-full bg-slate-50 rounded-2xl p-8 text-center border border-slate-100">
              <p className="text-slate-400 text-sm italic">No history available</p>
            </div>
          ) : (
            reviewHistory.map(p => (
              <div key={p.id} className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                    p.status === 'REJECTED' ? 'bg-rose-100 text-rose-600' : 
                    p.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-600' :
                    'bg-indigo-100 text-indigo-600'
                  }`}>
                    {p.status}
                  </span>
                  <span className="text-[10px] text-slate-400">{format(parseDate(p.requestDate), 'MMM d')}</span>
                </div>
                <p className="font-bold text-sm text-slate-900 truncate mb-1">{p.itemDescription}</p>
                <div className="flex flex-col gap-0.5 text-[10px] mb-2">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <UserIcon size={10} />
                    <span>Requester: <span className="font-semibold text-slate-700">{p.requestName || p.userName}</span></span>
                  </div>
                  {p.purchaserName && (
                    <div className="flex items-center gap-1.5 text-indigo-500">
                      <ShoppingCart size={10} />
                      <span>Purchaser: <span className="font-semibold text-indigo-700">{p.purchaserName}</span></span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-50">
                  <span className="font-bold text-slate-700">₹{p.actualCost || p.estCost}</span>
                  <span className="text-[10px] text-slate-400">Qty: {p.quantity}</span>
                </div>
                {p.adminRemarks && (
                   <p className="mt-2 pt-2 border-t border-slate-50 text-[10px] text-slate-400 italic italic truncate">
                      Rem: {p.adminRemarks}
                   </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function TrackingDashboard({ procurements }: { procurements: Procurement[] }) {
  const [filter, setFilter] = useState<ProcurementStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const filtered = procurements.filter(p => {
    const matchesStatus = filter === 'ALL' || p.status === filter;
    const matchesSearch = 
      p.itemDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.requestName || p.userName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.vendorName || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesDate = true;
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      matchesDate = matchesDate && new Date(p.requestDate) >= start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      matchesDate = matchesDate && new Date(p.requestDate) <= end;
    }
    
    return matchesStatus && matchesSearch && matchesDate;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Track Status</h2>
          <p className="text-slate-500">Monitor the lifecycle of your requests</p>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="relative w-full md:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text"
              placeholder="Search items, requesters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl text-xs font-medium border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white shadow-sm"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
            <Filter size={16} className="text-slate-400 shrink-0" />
            <FilterButton active={filter === 'ALL'} label="All" onClick={() => setFilter('ALL')} />
            <FilterButton active={filter === 'REQUESTED'} label="Pending Admin" onClick={() => setFilter('REQUESTED')} />
            <FilterButton active={filter === 'APPROVED'} label="Approved" onClick={() => setFilter('APPROVED')} />
            <FilterButton active={filter === 'PURCHASED'} label="Purchased" onClick={() => setFilter('PURCHASED')} />
            <FilterButton active={filter === 'PAYMENT_DONE'} label="Completed" onClick={() => setFilter('PAYMENT_DONE')} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">From Date</span>
          <input 
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs font-medium border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-emerald-50/30"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">To Date</span>
          <input 
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs font-medium border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-emerald-50/30"
          />
        </div>
        {(startDate || endDate || searchQuery || filter !== 'ALL') && (
          <button 
            onClick={() => {
              setStartDate('');
              setEndDate('');
              setSearchQuery('');
              setFilter('ALL');
            }}
            className="mt-auto px-4 py-2 hover:bg-rose-50 text-rose-600 font-bold text-[10px] uppercase tracking-wider transition-colors rounded-xl flex items-center gap-1.5"
          >
            <X size={12} />
            Reset Filters
          </button>
        )}
      </div>

      <div className="grid gap-4">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
            <p className="text-slate-400 italic">No items found matching this status.</p>
          </div>
        ) : (
          filtered.map(p => (
            <div key={p.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <StatusBadge status={p.status} />
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{format(parseDate(p.requestDate), 'MMM d, yyyy')}</span>
                </div>
                <h4 className="font-bold text-slate-900">{p.itemDescription}</h4>
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="flex items-center gap-1 text-[10px] text-slate-500">
                    <UserIcon size={10} />
                    <span>{p.requestName || p.userName}</span>
                  </div>
                  {p.purchaserName && (
                    <div className="flex items-center gap-1 text-[10px] text-indigo-500">
                      <ShoppingCart size={10} />
                      <span>{p.purchaserName}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2">
                   <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Clock size={12} />
                      Step: {getStepName(p.status)}
                   </div>
                   <p className="text-xs font-bold text-slate-700">₹{p.actualCost || p.estCost}</p>
                </div>
                {p.adminRemarks && (
                  <div className="mt-3 bg-amber-50/50 p-3 rounded-xl border border-amber-100 flex items-start gap-2.5">
                    <ShieldCheck size={14} className="text-amber-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-amber-500 font-bold uppercase tracking-wider mb-0.5">Admin Remark</p>
                      <p className="text-[11px] text-amber-900 leading-relaxed italic">"{p.adminRemarks}"</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-col md:items-end gap-1">
                 <p className="text-[10px] text-slate-400 font-bold uppercase">Current Owner</p>
                 <p className="text-xs font-medium text-slate-700">{getOwnerName(p.status)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function FilterButton({ active, label, onClick }: { active: boolean, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${active ? 'bg-emerald-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:border-emerald-300'}`}
    >
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: ProcurementStatus }) {
  const styles: Record<ProcurementStatus, string> = {
    REQUESTED: 'bg-blue-50 text-blue-600',
    PENDING: 'bg-amber-50 text-amber-600',
    APPROVED: 'bg-emerald-50 text-emerald-600',
    REJECTED: 'bg-rose-50 text-rose-600',
    PURCHASED: 'bg-indigo-50 text-indigo-600',
    NOTE_APPROVED: 'bg-purple-50 text-purple-600',
    PAYMENT_DONE: 'bg-slate-900 text-white'
  };
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${styles[status]}`}>
      {status}
    </span>
  );
}

function getStepName(status: ProcurementStatus) {
  const steps: Record<ProcurementStatus, string> = {
    REQUESTED: 'Awaiting Admin Approval',
    PENDING: 'Admin Review (In Progress)',
    APPROVED: 'Awaiting Purchase Details',
    REJECTED: 'Request Rejected',
    PURCHASED: 'Awaiting Approval Note',
    NOTE_APPROVED: 'Awaiting Payment Settlement',
    PAYMENT_DONE: 'Procurement Complete'
  };
  return steps[status];
}

function getOwnerName(status: ProcurementStatus) {
  if (['REQUESTED', 'PENDING', 'NOTE_APPROVED'].includes(status)) return 'Administrator';
  if (['APPROVED', 'PURCHASED'].includes(status)) return 'Procurement Team';
  return 'None';
}

function PurchaseEntry({ procurements, user, showAlert, showConfirm, sendNotification, adminUids }: { 
  procurements: Procurement[],
  user: User | null,
  showAlert: (m: string, t?: string) => void,
  showConfirm: (m: string, oc: () => void, t?: string) => void,
  sendNotification: any,
  adminUids: string[]
}) {
  const approvedItems = procurements.filter(p => p.status === 'APPROVED');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    purchaseDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    vendorName: '',
    actualCost: 0,
    invoiceNumber: '',
    purchaseRemarks: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) {
      showAlert('Please select an item from the list first.', 'No Selection');
      return;
    }
    
    showConfirm('Are you sure you want to submit these purchase details? This action cannot be undone.', async () => {
      setSubmitting(true);
      const docRef = doc(db, 'procurements', selectedId);
      
      const updateData = {
        purchaseDate: formData.purchaseDate,
        vendorName: formData.vendorName,
        actualCost: Number(formData.actualCost),
        invoiceNumber: formData.invoiceNumber,
        purchaseRemarks: formData.purchaseRemarks,
        purchaserName: user?.displayName || 'Unknown',
        purchaserId: user?.uid,
        status: 'PURCHASED' as ProcurementStatus,
        updatedAt: serverTimestamp()
      };

      try {
        await updateDoc(docRef, updateData);
        showAlert('The purchase details have been recorded successfully.', 'Success');
        
        // Notify admins
        if (user) {
          const item = approvedItems.find(p => p.id === selectedId);
          for (const adminUid of adminUids) {
            if (adminUid === user.uid) continue;
            await sendNotification(
              adminUid,
              'Purchase Recorded',
              `Purchase for ${item?.itemDescription} has been logged by ${user.displayName}.`,
              'INFO',
              selectedId
            );
          }
        }

        setSelectedId(null);
        setFormData({
          purchaseDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
          vendorName: '',
          actualCost: 0,
          invoiceNumber: '',
          purchaseRemarks: ''
        });
      } catch (error: any) {
        console.error('Purchase Submission Error:', error);
        showAlert(error.message || 'An error occurred while saving.', 'Error');
      } finally {
        setSubmitting(false);
      }
    }, 'Confirm Submission');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Purchase Entry</h2>
        <p className="text-slate-500">Log details of approved items after physical purchase</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Approved Items</h3>
          {approvedItems.length === 0 ? (
            <div className="bg-slate-100 rounded-xl p-6 text-center text-slate-400">
              No approved items to purchase
            </div>
          ) : (
            approvedItems.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`w-full p-4 rounded-2xl text-left border transition-all ${selectedId === p.id ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-200' : 'bg-white border-slate-200 hover:border-emerald-500 text-slate-900'}`}
              >
                <p className="font-bold truncate">{p.itemDescription}</p>
                <p className={`text-[10px] mt-1 ${selectedId === p.id ? 'text-emerald-100' : 'text-slate-500'}`}>Req: {p.requestName || p.userName}</p>
                <div className="flex justify-between mt-2 text-xs opacity-80">
                  <span>Qty: {p.quantity} {p.unit}</span>
                  <span>Est: ₹{p.estCost}</span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-2">
          {selectedId ? (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 bg-slate-50">
                <h3 className="font-bold text-lg text-slate-900">Purchase Details for:</h3>
                <p className="text-emerald-600 font-medium mb-4">{approvedItems.find(p => p.id === selectedId)?.itemDescription}</p>
                <div className="flex items-center gap-2 bg-white p-3 rounded-xl border border-slate-200 w-fit">
                  <UserIcon size={14} className="text-slate-400" />
                  <span className="text-xs font-bold text-slate-600">Requester: {approvedItems.find(p => p.id === selectedId)?.requestName || approvedItems.find(p => p.id === selectedId)?.userName}</span>
                </div>
              </div>
              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField label="Purchase Date" type="datetime-local" value={formData.purchaseDate} onChange={v => setFormData({...formData, purchaseDate: v})} required />
                  <FormField label="Vendor Name" value={formData.vendorName} onChange={v => setFormData({...formData, vendorName: v})} required />
                  <FormField label="Actual Cost" type="number" value={formData.actualCost} onChange={v => setFormData({...formData, actualCost: parseFloat(v) || 0})} required />
                  <FormField label="Invoice Number" value={formData.invoiceNumber} onChange={v => setFormData({...formData, invoiceNumber: v})} required />
                  <div className="md:col-span-2">
                    <FormField label="Purchase Remarks" type="textarea" value={formData.purchaseRemarks} onChange={v => setFormData({...formData, purchaseRemarks: v})} required />
                  </div>
                </div>
                <div className="flex justify-between items-center pt-4">
                  <button 
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-all"
                  >
                    Go Back
                  </button>
                  <button 
                    type="submit" 
                    disabled={submitting}
                    className="bg-slate-900 text-white px-10 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all disabled:opacity-50"
                  >
                    {submitting ? 'Submitting...' : 'Submit Purchase Data'}
                  </button>
                </div>
              </form>
            </motion.div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-200 border-dashed text-slate-400">
              <ShoppingCart size={48} className="mb-4 opacity-20" />
              <p>Select an approved item from the list to enter purchase details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ApprovalStatus({ procurements, sendNotification, adminUids, user }: { procurements: Procurement[], sendNotification: any, adminUids: string[], user: User | null }) {
  const purchasedItems = procurements.filter(p => p.status === 'PURCHASED');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    approvalNoteNo: '',
    approvalNoteDate: format(new Date(), "yyyy-MM-dd")
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    setSubmitting(true);
    try {
      const p = purchasedItems.find(item => item.id === selectedId);
      await updateDoc(doc(db, 'procurements', selectedId), {
        ...formData,
        status: 'NOTE_APPROVED',
        updatedAt: serverTimestamp()
      });

      // Notify User and Admin
      if (p) {
        // Notify Requester
        await sendNotification(
          p.userId,
          'Approval Note Created',
          `An approval note has been generated for ${p.itemDescription}.`,
          'STATUS_CHANGE',
          selectedId
        );
        // Notify Admins
        for (const adminUid of adminUids) {
          if (adminUid === user?.uid) continue;
          await sendNotification(
            adminUid,
            'Note Approved',
            `Approval note #${formData.approvalNoteNo} recorded for ${p.itemDescription}.`,
            'INFO',
            selectedId
          );
        }
      }

      setSelectedId(null);
      setFormData({ approvalNoteNo: '', approvalNoteDate: format(new Date(), "yyyy-MM-dd") });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `procurements/${selectedId}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Approval Status</h2>
        <p className="text-slate-500">Record final approval note details for purchased items</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Purchased Items</h3>
          {purchasedItems.length === 0 ? (
            <div className="bg-slate-100 rounded-xl p-6 text-center text-slate-400">
              No items awaiting approval note
            </div>
          ) : (
            purchasedItems.map(p => {
              const delay = differenceInDays(new Date(), parseDate(p.purchaseDate));
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full p-4 rounded-2xl text-left border transition-all flex justify-between items-start ${selectedId === p.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white border-slate-200 hover:border-indigo-500 text-slate-900 group'}`}
                >
                  <div className="flex-1 truncate">
                    <p className="font-bold truncate">{p.itemDescription}</p>
                    <p className={`text-[10px] mt-1 ${selectedId === p.id ? 'text-indigo-100' : 'text-slate-500'}`}>Req: {p.requestName || p.userName}</p>
                    <p className="text-xs opacity-70 mt-1">Vendor: {p.vendorName}</p>
                  </div>
                  <div className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${selectedId === p.id ? 'bg-indigo-400 text-white' : 'bg-rose-50 text-rose-600'}`}>
                    <Clock size={10} />
                    {delay}d Delay
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="lg:col-span-2">
          {selectedId ? (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 bg-slate-50">
                <span className="text-xs font-bold bg-rose-100 text-rose-600 px-2 py-0.5 rounded uppercase tracking-wider mb-2 inline-block">Awaiting Note</span>
                <h3 className="font-bold text-lg text-slate-900">Submit Approval Note for:</h3>
                <p className="text-indigo-600 font-medium mb-4">{purchasedItems.find(p => p.id === selectedId)?.itemDescription}</p>
                
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <DetailBox label="Requester" value={purchasedItems.find(p => p.id === selectedId)?.requestName || purchasedItems.find(p => p.id === selectedId)?.userName} />
                  <DetailBox label="Purchased On" value={format(parseDate(purchasedItems.find(p => p.id === selectedId)?.purchaseDate), 'MMM d, yyyy')} />
                  <DetailBox label="Vendor" value={purchasedItems.find(p => p.id === selectedId)?.vendorName} />
                  <DetailBox label="Actual Cost" value={`₹${purchasedItems.find(p => p.id === selectedId)?.actualCost}`} />
                  <DetailBox label="Invoice" value={purchasedItems.find(p => p.id === selectedId)?.invoiceNumber} />
                </div>
                {purchasedItems.find(p => p.id === selectedId)?.purchaseRemarks && (
                  <div className="mt-3 p-3 bg-white rounded-xl border border-slate-200">
                    <p className="text-[10px] text-slate-400 uppercase font-bold">Purchase Remarks</p>
                    <p className="text-xs text-slate-600 italic">{purchasedItems.find(p => p.id === selectedId)?.purchaseRemarks}</p>
                  </div>
                )}
              </div>
              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField label="Approval Note No." value={formData.approvalNoteNo} onChange={v => setFormData({...formData, approvalNoteNo: v})} required />
                  <FormField label="Approval Date" type="date" value={formData.approvalNoteDate} onChange={v => setFormData({...formData, approvalNoteDate: v})} required />
                </div>
                <div className="flex justify-between items-center pt-4">
                  <button 
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-all"
                  >
                    Go Back
                  </button>
                  <button 
                    type="submit" 
                    disabled={submitting}
                    className="bg-indigo-600 text-white px-10 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50"
                  >
                    {submitting ? 'Recording...' : 'Record Approval'}
                  </button>
                </div>
              </form>
            </motion.div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-200 border-dashed text-slate-400">
              <FileCheck size={48} className="mb-4 opacity-20" />
              <p>Select a purchased item to enter approval note info</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PaymentLedger({ procurements, sendNotification, adminUids, user }: { procurements: Procurement[], sendNotification: any, adminUids: string[], user: User | null }) {
  const approvedNotesItems = procurements.filter(p => p.status === 'NOTE_APPROVED');
  const paidItems = procurements.filter(p => p.status === 'PAYMENT_DONE');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    paymentDate: format(new Date(), "yyyy-MM-dd"),
    paymentAmount: 0
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    setSubmitting(true);
    try {
      const p = approvedNotesItems.find(item => item.id === selectedId);
      await updateDoc(doc(db, 'procurements', selectedId), {
        ...formData,
        status: 'PAYMENT_DONE',
        updatedAt: serverTimestamp()
      });

      // Notify User and Admin
      if (p) {
        // Notify Requester
        await sendNotification(
          p.userId,
          'Payment Completed',
          `Payment of ₹${formData.paymentAmount} has been processed for ${p.itemDescription}. Request is now complete.`,
          'STATUS_CHANGE',
          selectedId
        );
        // Notify Admins
        for (const adminUid of adminUids) {
          if (adminUid === user?.uid) continue;
          await sendNotification(
             adminUid,
             'Payment Processed',
             `Final payment of ₹${formData.paymentAmount} recorded for ${p.itemDescription} by ${user?.displayName}.`,
             'INFO',
             selectedId
          );
        }
      }

      setSelectedId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `procurements/${selectedId}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Payment Ledger</h2>
        <p className="text-slate-500">Track and settle payments for approved procurements</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Pending Payments</h3>
            <div className="space-y-3">
              {approvedNotesItems.length === 0 ? (
                <div className="bg-slate-100 rounded-xl p-4 text-center text-slate-400 text-sm italic">
                  No payments pending
                </div>
              ) : (
                approvedNotesItems.map(p => {
                  const delay = differenceInDays(new Date(), parseDate(p.approvalNoteDate));
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`w-full p-4 rounded-2xl text-left border transition-all ${selectedId === p.id ? 'bg-amber-600 border-amber-600 text-white shadow-lg shadow-amber-200' : 'bg-white border-slate-200 hover:border-amber-500 shadow-sm'}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-sm truncate flex-1">{p.itemDescription}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${selectedId === p.id ? 'bg-amber-400' : 'bg-rose-50 text-rose-600'}`}>
                          {delay}d Delay
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] opacity-80">
                        <span>Amt: ₹{p.actualCost}</span>
                        <span>Note: {p.approvalNoteNo}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Settled Payments</h3>
            <div className="space-y-2 opacity-60">
              {paidItems.map(p => (
                <div key={p.id} className="bg-white border border-slate-100 p-3 rounded-xl flex items-center justify-between text-xs">
                  <span className="font-medium truncate flex-1">{p.itemDescription}</span>
                  <span className="text-emerald-600 font-bold whitespace-nowrap ml-2">₹{p.paymentAmount} paid</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedId ? (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 bg-slate-50">
                <h3 className="font-bold text-lg text-slate-900">Complete Payment for:</h3>
                <p className="text-amber-600 font-medium">{approvedNotesItems.find(p => p.id === selectedId)?.itemDescription}</p>
                <div className="mt-4 grid grid-cols-2 lg:grid-cols-5 gap-2">
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <p className="text-[10px] text-slate-400 uppercase">Requester</p>
                    <p className="text-xs font-bold truncate">{approvedNotesItems.find(p => p.id === selectedId)?.requestName || approvedNotesItems.find(p => p.id === selectedId)?.userName}</p>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <p className="text-[10px] text-slate-400 uppercase">Vendor</p>
                    <p className="text-xs font-bold truncate">{approvedNotesItems.find(p => p.id === selectedId)?.vendorName}</p>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <p className="text-[10px] text-slate-400 uppercase">Actual Cost</p>
                    <p className="text-xs font-bold truncate">₹{approvedNotesItems.find(p => p.id === selectedId)?.actualCost}</p>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <p className="text-[10px] text-slate-400 uppercase">Approval No</p>
                    <p className="text-xs font-bold truncate">{approvedNotesItems.find(p => p.id === selectedId)?.approvalNoteNo}</p>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <p className="text-[10px] text-slate-400 uppercase">Purchaser</p>
                    <p className="text-xs font-bold truncate">{approvedNotesItems.find(p => p.id === selectedId)?.purchaserName || 'N/A'}</p>
                  </div>
                </div>
              </div>
              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField label="Payment Date" type="date" value={formData.paymentDate} onChange={v => setFormData({...formData, paymentDate: v})} required />
                  <FormField label="Payment Amount" type="number" value={formData.paymentAmount} onChange={v => setFormData({...formData, paymentAmount: parseFloat(v) || 0})} required />
                </div>
                <div className="flex justify-between items-center pt-4">
                  <button 
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-all"
                  >
                    Go Back
                  </button>
                  <button 
                    type="submit" 
                    disabled={submitting}
                    className="bg-emerald-600 text-white px-10 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                  >
                    {submitting ? 'Recording...' : 'Mark as Paid'}
                  </button>
                </div>
              </form>
            </motion.div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-200 border-dashed text-slate-400">
              <CreditCard size={48} className="mb-4 opacity-20" />
              <p>Select a pending entry to complete payment tracking</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Internal Helper Components ---

function FormField({ label, type = 'text', value, onChange, placeholder, required, options }: any) {
  const commonClasses = "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white outline-none transition-all text-slate-900 placeholder:text-slate-400";
  
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-slate-700">{label}{required && <span className="text-rose-500 ml-1">*</span>}</label>
      {type === 'textarea' ? (
        <textarea className={`${commonClasses} min-h-[100px] resize-none`} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} />
      ) : type === 'select' ? (
        <select className={commonClasses} value={value} onChange={e => onChange(e.target.value)} required={required}>
          {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : (
        <input type={type} className={commonClasses} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} />
      )}
    </div>
  );
}

function DetailBox({ label, value }: { label: string, value: any }) {
  return (
    <div className="bg-white p-2 rounded-lg border border-slate-200">
      <p className="text-[10px] text-slate-400 uppercase font-bold">{label}</p>
      <p className="text-xs font-bold truncate text-slate-700">{value || 'N/A'}</p>
    </div>
  );
}

const AdminCard: React.FC<{ 
  item: Procurement, 
  onAction: (id: string, s: ProcurementStatus, r: string) => Promise<void> | void, 
  loading: boolean,
  isSelected: boolean,
  onSelect: () => void
}> = ({ item, onAction, loading, isSelected, onSelect }) => {
  const [remarks, setRemarks] = useState('');
  
  return (
    <motion.div 
      layout
      className={`bg-white rounded-2xl p-6 shadow-sm border transition-all flex flex-col md:flex-row gap-6 ${isSelected ? 'border-indigo-400 ring-2 ring-indigo-50 shadow-md transform scale-[1.01]' : 'border-slate-200'}`}
    >
      <div className="flex items-start">
        <button 
          onClick={onSelect}
          className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all mt-1 ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-slate-200 hover:border-indigo-300'}`}
        >
          {isSelected && <Check size={14} strokeWidth={3} />}
        </button>
      </div>

      <div className="flex-1 space-y-3">
        <div className="flex items-center gap-3">
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            item.priority === 'Urgent' ? 'bg-rose-100 text-rose-700' :
            item.priority === 'High' ? 'bg-amber-100 text-amber-700' :
            'bg-slate-100 text-slate-600'
          }`}>
            {item.priority} Priority
          </span>
          <span className="text-[10px] text-slate-400 font-medium">Requested on {format(parseDate(item.requestDate), 'MMM d, h:mm a')}</span>
        </div>
        <h3 className="text-xl font-bold text-slate-900">{item.itemDescription}</h3>
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-lg text-slate-600">
            <UserIcon size={12} />
            <span className="text-xs font-bold whitespace-nowrap">Requested by: {item.requestName || item.userName}</span>
          </div>
          {item.purchaserName && (
            <div className="flex items-center gap-1.5 bg-indigo-50 px-2 py-1 rounded-lg text-indigo-600">
              <ShoppingCart size={12} />
              <span className="text-xs font-bold whitespace-nowrap">Purchaser: {item.purchaserName}</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-400 text-xs uppercase font-bold tracking-tight">Quantity</p>
            <p className="font-semibold text-slate-700">{item.quantity} {item.unit}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs uppercase font-bold tracking-tight">Est. Cost</p>
            <p className="font-semibold text-slate-700">₹{item.estCost}</p>
          </div>
          <div className="col-span-2">
            <p className="text-slate-400 text-xs uppercase font-bold tracking-tight">Purpose</p>
            <p className="text-slate-600 leading-relaxed">{item.purpose}</p>
          </div>
        </div>
      </div>

      <div className="w-full md:w-80 space-y-4 pt-4 md:pt-0 md:pl-6 md:border-l border-slate-100">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-500 uppercase h-4">Remarks</label>
          <textarea 
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm resize-none focus:ring-2 focus:ring-emerald-500 outline-none transition-all" 
            placeholder="Review notes..."
            rows={2}
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button 
            onClick={() => onAction(item.id, 'APPROVED', remarks)}
            disabled={loading}
            className="flex-1 bg-emerald-600 text-white rounded-lg py-2.5 text-xs font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            Approve
          </button>
          <button 
            onClick={() => onAction(item.id, 'REJECTED', remarks)}
            disabled={loading}
            className="flex-1 bg-slate-100 text-slate-600 rounded-lg py-2.5 text-xs font-bold hover:bg-rose-50 hover:text-rose-600 transition-colors disabled:opacity-50"
          >
            Reject
          </button>
          <button 
            onClick={() => onAction(item.id, 'PENDING', remarks)}
            disabled={loading}
            className="col-span-2 bg-slate-50 text-slate-500 rounded-lg py-2 text-xs font-bold hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            Mark Pending
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function AdminManagement({ authorizedUsers, showAlert, showConfirm }: { 
  authorizedUsers: {id: string, email: string, role?: 'USER' | 'ADMIN'}[],
  showAlert: (m: string, t?: string) => void,
  showConfirm: (m: string, oc: () => void, t?: string) => void
}) {
  const [allUsers, setAllUsers] = useState<{uid: string, email: string, displayName: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAuthEmail, setNewAuthEmail] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('email'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAllUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as any)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    return () => unsubscribe();
  }, []);

  const deleteUser = async (userUid: string, userEmail: string) => {
    if (userEmail.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
      showAlert("The bootstrap admin record cannot be deleted.", "Action Restricted");
      return;
    }

    showConfirm(`Are you sure you want to delete the user record for ${userEmail}? This will remove their profile from this list until they log in again.`, async () => {
      try {
        await deleteDoc(doc(db, 'users', userUid));
        showAlert(`User record for ${userEmail} has been deleted.`);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${userUid}`);
      }
    });
  };

  const addAuthorizedUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newAuthEmail.trim().toLowerCase();
    if (!email) return;

    try {
      await setDoc(doc(db, 'authorized_users', email), {
        email,
        role: 'USER',
        addedAt: serverTimestamp(),
        addedBy: auth.currentUser?.email
      });
      setNewAuthEmail('');
      showAlert(`${email} has been authorized to access the system.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `authorized_users/${email}`);
    }
  };

  const removeAuthorizedUser = async (email: string) => {
    if (email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
      showAlert("The bootstrap admin cannot be unauthorized.", "Action Restricted");
      return;
    }

    showConfirm(`Remove authorization for ${email}? This user will no longer be able to access the system.`, async () => {
      try {
        await deleteDoc(doc(db, 'authorized_users', email));
        showAlert(`${email} has been removed from authorized users.`);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `authorized_users/${email}`);
      }
    });
  };

  const toggleAuthorizedRole = async (email: string, currentRole: string) => {
    if (email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
      showAlert("The bootstrap admin role cannot be changed.", "Action Restricted");
      return;
    }

    const newRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
    showConfirm(`Change role for ${email} to ${newRole}?`, async () => {
      try {
        await updateDoc(doc(db, 'authorized_users', email), {
          role: newRole,
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.email
        });
        showAlert(`${email} is now a ${newRole}.`);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `authorized_users/${email}`);
      }
    });
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading users...</div>;

  return (
    <div className="space-y-8">
      {/* Authorized Users Management */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Users className="text-emerald-600" size={20} />
            Authorized Access List
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Only users in this list can log in. Admins are automatically authorized.
          </p>
        </div>
        
        <div className="p-6 border-b border-slate-100">
          <form onSubmit={addAuthorizedUser} className="flex gap-2">
            <input
              type="email"
              value={newAuthEmail}
              onChange={(e) => setNewAuthEmail(e.target.value)}
              placeholder="Enter email to authorize (e.g. user@example.com)"
              className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              required
            />
            <button
              type="submit"
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition-all shadow-sm flex items-center gap-2 leading-none"
            >
              <Plus size={16} />
              Authorize Email
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-100">
                <th className="px-6 py-4">Authorized Email</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {/* Add bootstrap admin manually if not in list, just as info */}
              <tr className="bg-emerald-50/30">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{BOOTSTRAP_ADMIN_EMAIL}</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold uppercase">System Admin</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase">ADMIN</span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="text-[10px] text-slate-400 font-medium italic">Cannot be changed</span>
                </td>
              </tr>
              {authorizedUsers.filter(u => u.email.toLowerCase() !== BOOTSTRAP_ADMIN_EMAIL.toLowerCase()).map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-slate-600">{u.email}</td>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => toggleAuthorizedRole(u.email, u.role || 'USER')}
                      className={`text-[10px] font-bold px-2 py-1 rounded-full transition-all ${
                        u.role === 'ADMIN' 
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {u.role || 'USER'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => removeAuthorizedUser(u.email)}
                      className="text-xs font-bold text-rose-600 hover:text-rose-700 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition-all flex items-center gap-1 ml-auto"
                    >
                      <X size={14} /> Remove Access
                    </button>
                  </td>
                </tr>
              ))}
              {authorizedUsers.length <= 1 && (
                <tr>
                  <td colSpan={2} className="px-6 py-8 text-center text-slate-400 text-sm">
                    No additional users authorized yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Registered Users Management */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <UserIcon className="text-emerald-600" size={20} />
            Registered Users
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Registered profiles of users who have already logged into the system.
          </p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-100">
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {allUsers.map((u) => {
                const isBootstrap = u.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
                
                return (
                  <tr key={u.uid} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-bold">
                          {u.displayName?.[0] || 'U'}
                        </div>
                        <span className="text-sm font-medium text-slate-900">{u.displayName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{u.email}</td>
                    <td className="px-6 py-4 text-right">
                      {!isBootstrap && (
                        <button
                          onClick={() => deleteUser(u.uid, u.email || '')}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          title="Delete User Profile"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      {isBootstrap && (
                        <span className="text-[10px] text-slate-400 font-medium italic">Fixed Primary Admin</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
