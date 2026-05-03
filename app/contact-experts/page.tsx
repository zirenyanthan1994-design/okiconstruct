"use client";
import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ContactExperts() {
  const router = useRouter();
  
  // --- STATE ---
  const [userData, setUserData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const [featuredExperts, setFeaturedExperts] = useState<any[]>([]);
  const [regularExperts, setRegularExperts] = useState<any[]>([]);
  
  const [currentPage, setCurrentPage] = useState(1);
  const EXPERTS_PER_PAGE = 100;

  // --- INITIALIZATION ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) setUserData(docSnap.data());
        
        fetchDirectory();
      } else {
        router.push('/dashboard'); 
      }
    });
    return () => unsubscribe();
  }, [router]);

  const fetchDirectory = async () => {
    try {
      const q = query(collection(db, "users"), where("tier", "==", "premium"));
      const querySnapshot = await getDocs(q);
      
      let allPremium: any[] = [];
      querySnapshot.forEach((d) => allPremium.push({ id: d.id, ...d.data() }));

      let featured = allPremium.filter(expert => expert.isFeatured === true);
      let regular = allPremium.filter(expert => expert.isFeatured !== true);

      featured.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      featured = featured.slice(0, 15);

      regular.sort((a, b) => (b.popularityScore || 0) - (a.popularityScore || 0));

      setFeaturedExperts(featured);
      setRegularExperts(regular);
    } catch (error) {
      console.error("Error fetching experts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/dashboard');
  };

  const totalPages = Math.ceil(regularExperts.length / EXPERTS_PER_PAGE);
  const startIndex = (currentPage - 1) * EXPERTS_PER_PAGE;
  const currentRegularExperts = regularExperts.slice(startIndex, startIndex + EXPERTS_PER_PAGE);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center font-black text-2xl uppercase">Loading Directory...</div>;

  const isPremium = userData?.tier === "premium";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-20">
      
      {/* 1. MASTER HEADER */}
      <header className="bg-black text-white border-b-4 border-black sticky top-0 z-50">
        {/* Header Bar */}
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-20 flex justify-between items-center bg-black relative z-50">
          
          {/* Logo */}
          <Link href="/dashboard" className="font-black text-2xl tracking-tighter cursor-pointer hover:opacity-80 transition-opacity">
            <span className="text-white">OKI</span><span className="text-[#22c55e]">CONSTRUCT</span>
          </Link>

          {/* Universal Menu Button (Visible on ALL screens) */}
          <button 
            className="flex items-center gap-2 text-white font-black text-xl hover:text-[#22c55e] transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <span className="text-sm tracking-widest uppercase hidden md:inline-block">Menu</span>
            <span className="text-2xl">{isMobileMenuOpen ? "✕" : "☰"}</span>
          </button>
        </div>

        {/* Universal Dropdown Drawer */}
        {isMobileMenuOpen && (
          <nav className="absolute top-full left-0 w-full bg-gray-900 border-b-4 border-black flex flex-col p-6 gap-4 animate-in slide-in-from-top-2 shadow-[0px_10px_0px_0px_rgba(0,0,0,1)] z-40">
            <div className="max-w-[1400px] mx-auto w-full flex flex-col gap-4">
              <Link href="/estimate-boq" className="font-black text-sm md:text-base uppercase hover:text-[#22c55e] border-b border-gray-800 pb-3 transition-colors">Estimate BOQ</Link>
              <Link href="/track-expenditure" className="font-black text-sm md:text-base uppercase hover:text-[#22c55e] border-b border-gray-800 pb-3 transition-colors">Track Expenditure</Link>
              <Link href="/contact-experts" className="font-black text-sm md:text-base uppercase hover:text-[#22c55e] border-b border-gray-800 pb-3 transition-colors">Contact Experts</Link>
              
              {isPremium && (
                <Link href="/custom-settings" className="font-black text-sm md:text-base uppercase text-[#22c55e] border-b border-gray-800 pb-3 hover:text-white transition-colors">
                  ⚙️ Custom Rates
                </Link>
              )}
              
              <Link href="/profile" className="font-black text-sm md:text-base uppercase text-gray-300 hover:text-white border-b border-gray-800 pb-3 transition-colors">My Profile</Link>
              
              <button onClick={handleLogout} className="font-black text-sm md:text-base uppercase text-red-500 text-left pt-2 hover:text-white transition-colors w-fit">
                Logout ➔
              </button>
            </div>
          </nav>
        )}
      </header>

      <main className="max-w-[1400px] mx-auto p-4 md:p-6 mt-10 w-full flex-grow">
        
        {/* HERO SECTION */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-4">The Expert Directory</h1>
          <p className="text-xl font-bold text-gray-500 max-w-2xl mx-auto">Connect with top-tier, certified professionals to bring your construction project to life. Only verified Premium tier partners are listed here.</p>
        </div>

        {/* SECTION 1: FEATURED EXPERTS */}
        {featuredExperts.length > 0 && (
          <div className="mb-20">
            <div className="flex items-end justify-between mb-8 border-b-8 border-[#22c55e] pb-2">
              <h2 className="text-3xl font-black uppercase">Featured Partners</h2>
              <span className="font-bold text-gray-500 text-sm uppercase bg-green-100 px-3 py-1">Top Rated</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {featuredExperts.map((expert) => (
                <div key={expert.id} className="bg-black text-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(34,197,94,1)] relative overflow-hidden group hover:-translate-y-2 transition-transform">
                  <div className="absolute top-4 right-4 bg-[#22c55e] text-black font-black text-[10px] px-2 py-1 uppercase tracking-widest">Featured</div>
                  <h3 className="text-2xl font-black uppercase mb-1 truncate pr-20">{expert.name}</h3>
                  <p className="text-[#22c55e] font-black tracking-widest text-sm uppercase mb-6">{expert.role}</p>
                  <div className="space-y-2 mb-8">
                    <p className="text-gray-300 font-bold text-sm">📞 {expert.phone || "Contact to view"}</p>
                    <p className="text-gray-300 font-bold text-sm">✉️ {expert.email}</p>
                  </div>
                  <button className="w-full bg-[#22c55e] text-black font-black uppercase py-3 hover:bg-white transition-colors">Contact Now</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECTION 2: REGULAR DIRECTORY */}
        <div>
          <div className="flex items-end justify-between mb-8 border-b-8 border-black pb-2">
            <h2 className="text-3xl font-black uppercase">Verified Professionals</h2>
            <span className="font-bold text-gray-500 text-sm uppercase">Showing {currentRegularExperts.length} Results</span>
          </div>

          {regularExperts.length === 0 ? (
            <div className="bg-white border-4 border-dashed border-gray-300 p-16 text-center">
              <h3 className="text-2xl font-black uppercase text-gray-400">No Professionals Found</h3>
              <p className="font-bold text-gray-500 mt-2">More premium partners will appear here soon.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {currentRegularExperts.map((expert) => (
                <div key={expert.id} className="bg-white border-4 border-black p-5 hover:bg-gray-50 transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                  <h3 className="text-xl font-black uppercase mb-1 truncate">{expert.name}</h3>
                  <p className="text-gray-500 font-black tracking-widest text-xs uppercase mb-4 pb-2 border-b-2 border-gray-200">{expert.role}</p>
                  <div className="space-y-1 mb-6">
                    <p className="text-black font-bold text-xs truncate">📞 {expert.phone || "Hidden"}</p>
                    <p className="text-black font-bold text-xs truncate">✉️ {expert.email}</p>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase bg-gray-200 px-2 py-1">Score: {expert.popularityScore || 0}</span>
                    <button className="text-[#22c55e] font-black text-sm uppercase hover:text-black hover:underline">View Profile</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* PAGINATION */}
          {totalPages > 1 && (
            <div className="mt-12 flex justify-center items-center gap-6">
              <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} className="bg-black text-white font-black uppercase px-6 py-3 disabled:opacity-30 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-y-1">Left</button>
              <span className="font-black uppercase text-lg">Page {currentPage} of {totalPages}</span>
              <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="bg-black text-white font-black uppercase px-6 py-3 disabled:opacity-30 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-y-1">Right</button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}