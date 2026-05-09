"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { auth, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<Record<string, any> | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) setUserData(docSnap.data());
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = '/'; 
  };

  if (!user) return null; 

  const isPremium = userData?.tier === "premium";

  return (
    <>
      {/* Added print:hidden here to prevent it from showing on PDFs */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-50 print:hidden">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-20 flex justify-between items-center relative z-50">
          
        <Link href="/" className="flex items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-8 h-8 md:w-10 md:h-10">
            <path d="M 50 15 A 35 35 0 1 0 85 50" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" className="text-gray-900" />
            <path d="M 50 15 L 85 15 L 85 50" fill="none" stroke="#22c55e" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-extrabold text-xl md:text-2xl tracking-tight text-gray-900">
            OKI<span className="text-[#22c55e]">CONSTRUCT</span>
          </span>
        </Link>

          <nav className="hidden lg:flex items-center gap-8">
            <Link href="/estimate-boq" className="font-semibold text-sm text-gray-600 hover:text-[#22c55e] transition-colors">Estimate BOQ</Link>
            <Link href="/track-expenditure" className="font-semibold text-sm text-gray-600 hover:text-[#22c55e] transition-colors">Expense Tracking</Link>
            <Link href="/contact-experts" className="font-semibold text-sm text-gray-600 hover:text-[#22c55e] transition-colors">Contact Experts</Link>
            {isPremium && (
              <Link href="/custom-settings" className="font-bold text-xs bg-gray-900 text-[#22c55e] px-4 py-1.5 rounded-full">PRO ENGINE</Link>
            )}
          </nav>

          <div className="hidden lg:flex items-center gap-6 border-l border-gray-200 pl-6">
            
            {/* NEW DESKTOP SEARCH BAR WITH OKICONSTRUCT ICON */}
            <div className="relative group w-48 xl:w-64">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <path d="M 50 15 A 35 35 0 1 0 85 50" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" className="text-gray-400 group-focus-within:text-gray-900 transition-colors" />
                <path d="M 50 15 L 85 15 L 85 50" fill="none" stroke="#22c55e" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <input 
                type="text" 
                placeholder="Search..." 
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm font-medium rounded-xl pl-9 pr-3 py-1.5 outline-none focus:ring-2 focus:ring-[#22c55e]/20 focus:border-[#22c55e] transition-all"
              />
            </div>

            <Link href="/profile" className="font-medium text-gray-500 hover:text-gray-900 text-sm transition-colors">
              {userData?.name ? userData.name.split(' ')[0] : 'Profile'}
            </Link>
            <button onClick={handleLogout} className="font-semibold text-sm bg-white border border-gray-200 text-gray-700 px-5 py-2 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
              Logout
            </button>
          </div>
          
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="lg:hidden flex items-center gap-2 text-gray-900 hover:text-[#22c55e] transition-colors">
            <span className="text-2xl leading-none">{isMobileMenuOpen ? "✕" : "☰"}</span>
          </button>
        </div>

        {isMobileMenuOpen && (
          <nav className="lg:hidden absolute top-full left-0 w-full bg-white border-b border-gray-100 flex flex-col p-6 gap-2 shadow-lg z-40 rounded-b-2xl">
            <div className="max-w-[1400px] mx-auto w-full flex flex-col gap-2">
              
              {/* NEW MOBILE SEARCH BAR WITH OKICONSTRUCT ICON */}
              <div className="relative group w-full mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <path d="M 50 15 A 35 35 0 1 0 85 50" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" className="text-gray-400 group-focus-within:text-gray-900 transition-colors" />
                  <path d="M 50 15 L 85 15 L 85 50" fill="none" stroke="#22c55e" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <input 
                  type="text" 
                  placeholder="Search projects..." 
                  className="w-full bg-gray-50 border border-gray-200 text-gray-900 font-medium rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-[#22c55e]/20 focus:border-[#22c55e] transition-all"
                />
              </div>

              <Link href="/estimate-boq" onClick={() => setIsMobileMenuOpen(false)} className="font-medium text-lg text-gray-700 hover:text-[#22c55e] p-2 rounded-lg hover:bg-gray-50">Estimate BOQ</Link>
              <Link href="/track-expenditure" onClick={() => setIsMobileMenuOpen(false)} className="font-medium text-lg text-gray-700 hover:text-[#22c55e] p-2 rounded-lg hover:bg-gray-50">Track Expenditure</Link>
              <Link href="/contact-experts" onClick={() => setIsMobileMenuOpen(false)} className="font-medium text-lg text-gray-700 hover:text-[#22c55e] p-2 rounded-lg hover:bg-gray-50">Contact Experts</Link>
              {isPremium && <Link href="/custom-settings" onClick={() => setIsMobileMenuOpen(false)} className="font-medium text-lg text-[#22c55e] p-2 rounded-lg hover:bg-green-50">⚙️ Custom Engine</Link>}
              <Link href="/profile" onClick={() => setIsMobileMenuOpen(false)} className="font-medium text-lg text-gray-700 hover:text-[#22c55e] p-2 rounded-lg hover:bg-gray-50">My Profile</Link>
              <button onClick={handleLogout} className="font-semibold text-base text-white bg-gray-900 p-3 rounded-xl text-center mt-4 hover:bg-gray-800 transition-colors">Logout</button>
            </div>
          </nav>
        )}
      </header>
    </>
  );
}