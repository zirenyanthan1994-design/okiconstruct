"use client";
import { useState, useEffect } from 'react';
import { auth } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import Link from 'next/link';

export default function AffiliateGateway() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        // Instantly redirect logged-in users to their profile's partner tab
        window.location.href = '/profile?tab=partner';
      } else {
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 text-center">
      <div className="w-20 h-20 bg-purple-50 text-purple-600 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-6 shadow-sm border border-purple-100">🤝</div>
      <h1 className="text-3xl font-black text-gray-900 mb-4">Partner Portal</h1>
      <p className="text-gray-500 mb-8 font-medium max-w-md mx-auto">
        Join the Oki Partner program to earn a 20% commission on referrals. Log in or sign up to access your dashboard.
      </p>
      <div className="flex flex-col sm:flex-row gap-4 justify-center w-full max-w-sm sm:max-w-none mx-auto">
        {/* Update these hrefs to match your actual login/register paths if they differ */}
        <Link href="/login?intent=affiliate" className="bg-white border border-gray-200 text-gray-900 px-8 py-3 rounded-xl font-bold hover:bg-gray-100 transition-colors shadow-sm">
          Log In
        </Link>
        <Link href="/register?intent=affiliate" className="bg-purple-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-purple-700 transition-colors shadow-md">
          Sign Up as Partner
        </Link>
      </div>
    </div>
  );
}