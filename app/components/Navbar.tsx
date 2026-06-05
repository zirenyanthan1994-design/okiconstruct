"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { auth } from '../lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';

export default function Navbar() {
  const [user, setUser] = useState<any>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-50 print:hidden">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-20 flex justify-between items-center bg-white relative z-50">
        
        {/* LOGO */}
        <Link href="/" className="flex items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-8 h-8 md:w-10 md:h-10">
            <path d="M 50 15 A 35 35 0 1 0 85 50" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" className="text-gray-900" />
            <path d="M 50 15 L 85 15 L 85 50" fill="none" stroke="#22c55e" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-extrabold text-xl md:text-2xl tracking-tight text-gray-900">
            OKI<span className="text-[#22c55e]">CONSTRUCT</span>
          </span>
        </Link>

        {/* DESKTOP LINKS */}
        <nav className="hidden lg:flex items-center gap-6">
          <Link href="/generate-2d-layout" className="text-sm font-bold text-gray-600 hover:text-[#22c55e] transition-colors">Layout Generator</Link>
          <Link href="/estimate-boq" className="text-sm font-bold text-gray-600 hover:text-[#22c55e] transition-colors">Estimate BOQ</Link>
          <Link href="/track-expenditure" className="text-sm font-bold text-gray-600 hover:text-[#22c55e] transition-colors">Track Expenses</Link>
          <Link href="/upgrade" className="text-sm font-bold text-purple-600 bg-purple-50 px-3 py-1.5 rounded-lg hover:bg-purple-100 transition-colors">🚀 Upgrade</Link>
        </nav>

        {/* PROFILE / AUTH BUTTONS */}
        <div className="hidden lg:flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3">
              <Link href="/profile" className="text-sm font-bold bg-gray-100 text-gray-700 px-4 py-2 rounded-xl hover:bg-gray-200 transition-colors">My Profile</Link>
              <button onClick={handleLogout} className="text-sm font-bold bg-gray-900 text-white px-4 py-2 rounded-xl hover:bg-red-500 transition-colors">Logout</button>
            </div>
          ) : (
            <Link href="/" className="text-sm font-bold bg-[#22c55e] text-white px-6 py-2.5 rounded-xl hover:bg-[#1ea950] transition-colors shadow-sm">Login / Register</Link>
          )}
        </div>

        {/* MOBILE MENU TOGGLE */}
        <button 
          className="flex lg:hidden items-center gap-2 text-gray-900 hover:text-[#22c55e] transition-colors"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          <span className="text-sm font-semibold uppercase tracking-wider hidden md:inline-block">Menu</span>
          <span className="text-2xl leading-none">{isMobileMenuOpen ? "✕" : "☰"}</span>
        </button>
      </div>

      {/* MOBILE MENU DROPDOWN */}
      {isMobileMenuOpen && (
        <nav className="absolute top-full left-0 w-full bg-white border-b border-gray-100 flex flex-col p-6 gap-2 shadow-lg z-40 rounded-b-2xl lg:hidden">
          <div className="max-w-[1400px] mx-auto w-full flex flex-col gap-2">
            <Link href="/generate-2d-layout" onClick={() => setIsMobileMenuOpen(false)} className="font-bold text-gray-700 hover:text-[#22c55e] hover:bg-gray-50 p-3 rounded-lg transition-colors">Generate 2D Layout</Link>
            <Link href="/estimate-boq" onClick={() => setIsMobileMenuOpen(false)} className="font-bold text-gray-700 hover:text-[#22c55e] hover:bg-gray-50 p-3 rounded-lg transition-colors">Estimate BOQ</Link>
            <Link href="/track-expenditure" onClick={() => setIsMobileMenuOpen(false)} className="font-bold text-gray-700 hover:text-[#22c55e] hover:bg-gray-50 p-3 rounded-lg transition-colors">Track Expenditure</Link>
            <Link href="/upgrade" onClick={() => setIsMobileMenuOpen(false)} className="font-bold text-purple-600 hover:bg-purple-50 p-3 rounded-lg transition-colors">🚀 Upgrade / Add-Ons</Link>
            
            <hr className="my-2 border-gray-100" />
            
            {user ? (
              <>
                <Link href="/profile" onClick={() => setIsMobileMenuOpen(false)} className="font-bold text-gray-700 hover:text-[#22c55e] hover:bg-gray-50 p-3 rounded-lg transition-colors">My Profile</Link>
                <button onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }} className="font-bold text-white bg-gray-900 rounded-xl px-4 py-3 mt-2 hover:bg-red-500 transition-colors w-fit">Logout</button>
              </>
            ) : (
              <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="font-bold text-white bg-[#22c55e] rounded-xl px-4 py-3 mt-2 hover:bg-[#1ea950] transition-colors w-fit text-center shadow-sm">Login / Register</Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}