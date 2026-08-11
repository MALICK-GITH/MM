// Service Worker pour Firebase Cloud Messaging
// Importer les scripts Firebase
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyA5Q6uBGoP66e4G2iXbVOvI3LBiqs8vt2U",
  authDomain: "notificationwork-53964.firebaseapp.com",
  projectId: "notificationwork-53964",
  storageBucket: "notificationwork-53964.firebasestorage.app",
  messagingSenderId: "159225723483",
  appId: "1:159225723483:web:1a9bf2a08d504198695d7e",
  measurementId: "G-CBKJLVEEGS",
};

// Initialiser Firebase
firebase.initializeApp(firebaseConfig);

// Initialiser Firebase Messaging
const messaging = firebase.messaging();

// Gérer les messages en arrière-plan
messaging.onBackgroundMessage((payload) => {
  console.log('[Firebase Messaging] Message reçu en arrière-plan:', payload);
  
  const notificationTitle = payload.notification?.title || 'SKILL2CASH';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: payload.data?.tag || 'skill2cash-notification',
    data: payload.data,
    requireInteraction: true,
  };

  // Afficher la notification
  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Gérer le clic sur la notification
self.addEventListener('notificationclick', (event) => {
  console.log('[Firebase Messaging] Notification cliquée:', event);
  
  event.notification.close();
  
  // Ouvrir l'application ou une page spécifique
  const urlToOpen = event.notification.data?.link || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Chercher un onglet déjà ouvert
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Sinon ouvrir un nouvel onglet
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Gérer l'installation du service worker
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installation');
  self.skipWaiting();
});

// Gérer l'activation du service worker
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activation');
  event.waitUntil(self.clients.claim());
});
