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

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-[#22c55e] font-bold text-xl flex items-center gap-3">
        <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        Loading Directory...
      </div>
    </div>
  );

  const isPremium = userData?.tier === "premium";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-20 font-sans">
      
      {/* 1. MASTER HEADER (Matches Current Theme) */}
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
            <Link href="/contact-experts" className="font-semibold text-sm text-[#22c55e] transition-colors">Contact Experts</Link>
            {isPremium && (
              <Link href="/custom-settings" className="font-bold text-xs bg-gray-900 text-[#22c55e] px-4 py-1.5 rounded-full hover:bg-gray-800 transition-colors">PRO ENGINE</Link>
            )}
          </nav>

          <div className="hidden lg:flex items-center gap-6 border-l border-gray-200 pl-6">
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
          <nav className="lg:hidden absolute top-full left-0 w-full bg-white border-b border-gray-100 flex flex-col p-6 gap-2 shadow-lg z-40 rounded-b-3xl">
            <div className="max-w-[1400px] mx-auto w-full flex flex-col gap-2">
              <Link href="/estimate-boq" onClick={() => setIsMobileMenuOpen(false)} className="font-medium text-lg text-gray-700 hover:text-[#22c55e] p-2 rounded-xl hover:bg-gray-50">Estimate BOQ</Link>
              <Link href="/track-expenditure" onClick={() => setIsMobileMenuOpen(false)} className="font-medium text-lg text-gray-700 hover:text-[#22c55e] p-2 rounded-xl hover:bg-gray-50">Track Expenditure</Link>
              <Link href="/contact-experts" onClick={() => setIsMobileMenuOpen(false)} className="font-medium text-lg text-[#22c55e] bg-green-50 p-2 rounded-xl">Contact Experts</Link>
              {isPremium && <Link href="/custom-settings" onClick={() => setIsMobileMenuOpen(false)} className="font-bold text-lg text-gray-900 p-2 rounded-xl hover:bg-gray-50">⚙️ Pro Engine</Link>}
              <Link href="/profile" onClick={() => setIsMobileMenuOpen(false)} className="font-medium text-lg text-gray-700 hover:text-[#22c55e] p-2 rounded-xl hover:bg-gray-50">My Profile</Link>
              <button onClick={handleLogout} className="font-semibold text-base text-white bg-gray-900 p-4 rounded-xl text-center mt-4 hover:bg-gray-800 transition-colors shadow-md">Logout</button>
            </div>
          </nav>
        )}
      </header>

      <main className="max-w-[1400px] mx-auto p-4 md:p-8 mt-6 w-full flex-grow">
        
        {/* HERO SECTION */}
        <div className="text-center mb-16 pt-8">
          <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-6 text-3xl shadow-sm border border-blue-100">🤝</div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-gray-900 mb-4">The Expert Directory</h1>
          <p className="text-lg font-medium text-gray-500 max-w-2xl mx-auto leading-relaxed">Connect with top-tier, certified professionals to bring your construction project to life. Only verified Premium tier partners are listed here.</p>
        </div>

        {/* SECTION 1: FEATURED EXPERTS */}
        {featuredExperts.length > 0 && (
          <div className="mb-20">
            <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-8 border-b border-gray-200 pb-4 gap-4">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Featured Partners</h2>
              <span className="font-bold text-[#22c55e] text-xs uppercase tracking-widest bg-green-50 border border-green-100 px-4 py-2 rounded-full">Top Rated</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredExperts.map((expert) => (
                <div key={expert.id} className="bg-white border border-gray-100 rounded-3xl p-8 shadow-sm hover:shadow-lg transition-all relative group overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#22c55e] to-green-300"></div>
                  <h3 className="text-2xl font-black text-gray-900 mb-1 truncate pr-10">{expert.name}</h3>
                  <p className="text-[#22c55e] font-bold tracking-widest text-xs uppercase mb-8">{expert.role}</p>
                  
                  <div className="space-y-3 mb-10">
                    <div className="flex items-center gap-3 text-gray-600 bg-gray-50 p-3 rounded-xl">
                      <span className="text-xl">📞</span>
                      <span className="font-semibold text-sm">{expert.phone || "Contact to view"}</span>
                    </div>
                    <div className="flex items-center gap-3 text-gray-600 bg-gray-50 p-3 rounded-xl">
                      <span className="text-xl">✉️</span>
                      <span className="font-semibold text-sm truncate">{expert.email}</span>
                    </div>
                  </div>
                  
                  <button className="w-full bg-gray-900 text-white font-bold text-sm uppercase tracking-wider py-4 rounded-xl hover:bg-[#22c55e] transition-colors shadow-md group-hover:shadow-lg">
                    Contact Now
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECTION 2: REGULAR DIRECTORY */}
        <div>
          <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-8 border-b border-gray-200 pb-4 gap-4">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Verified Professionals</h2>
            <span className="font-semibold text-gray-500 text-sm">Showing {currentRegularExperts.length} Results</span>
          </div>

          {regularExperts.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-200 rounded-3xl p-16 text-center">
              <h3 className="text-xl font-bold text-gray-400 mb-2">No Professionals Found</h3>
              <p className="font-medium text-gray-500">More premium partners will appear here soon.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {currentRegularExperts.map((expert) => (
                <div key={expert.id} className="bg-white border border-gray-100 rounded-2xl p-6 hover:border-[#22c55e]/30 hover:shadow-md transition-all">
                  <h3 className="text-lg font-bold text-gray-900 mb-1 truncate">{expert.name}</h3>
                  <p className="text-gray-500 font-bold tracking-widest text-[10px] uppercase mb-4 pb-3 border-b border-gray-100">{expert.role}</p>
                  
                  <div className="space-y-2 mb-6">
                    <p className="text-gray-600 font-medium text-xs flex items-center gap-2 truncate">
                      <span className="text-gray-400">📞</span> {expert.phone || "Hidden"}
                    </p>
                    <p className="text-gray-600 font-medium text-xs flex items-center gap-2 truncate">
                      <span className="text-gray-400">✉️</span> {expert.email}
                    </p>
                  </div>
                  
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-[10px] font-bold text-gray-500 uppercase bg-gray-50 px-2.5 py-1 rounded-md border border-gray-100">Score: {expert.popularityScore || 0}</span>
                    <button className="text-[#22c55e] font-bold text-xs uppercase tracking-wider hover:text-green-700 transition-colors">Profile ➔</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* PAGINATION */}
          {totalPages > 1 && (
            <div className="mt-12 flex justify-center items-center gap-4">
              <button 
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} 
                disabled={currentPage === 1} 
                className="bg-white text-gray-700 font-bold text-sm px-6 py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
              >
                Previous
              </button>
              <span className="font-semibold text-gray-500 text-sm bg-white border border-gray-100 px-6 py-3 rounded-xl shadow-sm">
                Page <span className="text-gray-900 font-bold">{currentPage}</span> of {totalPages}
              </span>
              <button 
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} 
                disabled={currentPage === totalPages} 
                className="bg-white text-gray-700 font-bold text-sm px-6 py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}