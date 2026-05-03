"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { auth, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';

export default function Navbar() {
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
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
    window.location.href = '/dashboard'; // Force full redirect to clear state
  };

  // If nobody is logged in, don't show the internal app navigation
  if (!user) return null; 

  const isPremium = userData?.tier === "premium";

  return (
    <>
      <header className="bg-white border-b-[6px] border-black sticky top-0 z-50 shadow-[0px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-20 flex justify-between items-center bg-white relative z-50">
          
          {/* LOGO */}
          <Link href="/profile" className="font-black text-2xl md:text-3xl tracking-tighter cursor-pointer hover:text-[#22c55e] transition-colors">
            <span className="text-black">OKI</span><span className="text-[#22c55e]">CONSTRUCT</span>
          </Link>

          {/* DESKTOP SAAS NAVIGATION */}
          <nav className="hidden lg:flex items-center gap-8">
            <Link href="/estimate-boq" className="font-black uppercase text-sm tracking-widest hover:text-[#22c55e] transition-colors">Estimate BOQ</Link>
            <Link href="/track-expenditure" className="font-black uppercase text-sm tracking-widest hover:text-[#22c55e] transition-colors">Ledger</Link>
            <Link href="/contact-experts" className="font-black uppercase text-sm tracking-widest hover:text-[#22c55e] transition-colors">Directory</Link>
            {isPremium && (
              <Link href="/custom-settings" className="font-black uppercase text-sm tracking-widest bg-black text-[#22c55e] px-3 py-1">PRO ENGINE</Link>
            )}
          </nav>

          {/* DESKTOP USER CONTROLS */}
          <div className="hidden lg:flex items-center gap-4 border-l-[4px] border-black pl-6">
            <Link href="/profile" className="font-bold text-gray-500 hover:text-black uppercase text-sm tracking-widest transition-colors">
              {userData?.name ? userData.name.split(' ')[0] : 'Profile'}
            </Link>
            <button onClick={handleLogout} className="font-black uppercase text-sm bg-[#22c55e] border-[3px] border-black px-4 py-2 hover:bg-black hover:text-[#22c55e] transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-y-0.5">
              Logout
            </button>
          </div>
          
          {/* MOBILE HAMBURGER BUTTON */}
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="lg:hidden flex items-center gap-2 font-black text-xl hover:text-[#22c55e] transition-colors">
            <span className="text-xs tracking-widest uppercase mt-1">Menu</span>
            <span className="text-3xl leading-none">{isMobileMenuOpen ? "✕" : "☰"}</span>
          </button>
        </div>

        {/* MOBILE DROPDOWN MENU */}
        {isMobileMenuOpen && (
          <nav className="lg:hidden absolute top-full left-0 w-full bg-white border-b-[6px] border-black flex flex-col p-6 gap-4 shadow-[0px_12px_0px_0px_rgba(0,0,0,1)] z-40">
            <div className="max-w-[1400px] mx-auto w-full flex flex-col gap-4">
              <Link href="/estimate-boq" onClick={() => setIsMobileMenuOpen(false)} className="font-black text-lg uppercase hover:text-[#22c55e] border-b-4 border-gray-100 pb-3">Estimate BOQ</Link>
              <Link href="/track-expenditure" onClick={() => setIsMobileMenuOpen(false)} className="font-black text-lg uppercase hover:text-[#22c55e] border-b-4 border-gray-100 pb-3">Track Expenditure</Link>
              <Link href="/contact-experts" onClick={() => setIsMobileMenuOpen(false)} className="font-black text-lg uppercase hover:text-[#22c55e] border-b-4 border-gray-100 pb-3">Contact Experts</Link>
              {isPremium && <Link href="/custom-settings" onClick={() => setIsMobileMenuOpen(false)} className="font-black text-lg uppercase text-[#22c55e] border-b-4 border-gray-100 pb-3">⚙️ Custom Engine</Link>}
              <Link href="/profile" onClick={() => setIsMobileMenuOpen(false)} className="font-black text-lg uppercase hover:text-[#22c55e] border-b-4 border-gray-100 pb-3">My Profile</Link>
              <button onClick={handleLogout} className="font-black text-lg uppercase text-white bg-black p-3 text-center mt-2 shadow-[4px_4px_0px_0px_rgba(34,197,94,1)]">Logout ➔</button>
            </div>
          </nav>
        )}
      </header>
    </>
  );
}