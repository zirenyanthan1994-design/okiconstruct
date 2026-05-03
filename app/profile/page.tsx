"use client";
import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Profile() {
  const router = useRouter();
  
  // --- STATE ---
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Editable Profile State
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  // --- INITIALIZATION ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        await fetchData(currentUser.uid);
      } else {
        router.push('/dashboard');
      }
    });
    return () => unsubscribe();
  }, [router]);

  const fetchData = async (uid: string) => {
    try {
      // 1. Fetch User Data
      const docRef = doc(db, "users", uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserData(data);
        setEditName(data.name || "");
        setEditPhone(data.phone || "");
      }

      // 2. Fetch User's Projects (BOQ / Expenditure)
      const q = query(collection(db, "boq_projects"), where("userId", "==", uid));
      const projectSnap = await getDocs(q);
      const fetchedProjects: any[] = [];
      projectSnap.forEach((d) => fetchedProjects.push({ id: d.id, ...d.data() }));
      
      // Sort newest first
      fetchedProjects.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setProjects(fetchedProjects);

    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // --- ACTION HANDLERS ---
  const handleLogout = async () => {
    await signOut(auth);
    router.push('/dashboard');
  };

  const handleUpdateProfile = async (e: any) => {
    e.preventDefault();
    if (!user) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        name: editName.trim(),
        phone: editPhone.trim()
      });
      setUserData({ ...userData, name: editName.trim(), phone: editPhone.trim() });
      alert("Profile updated successfully!");
    } catch (error) {
      console.error("Error updating profile:", error);
      alert("Failed to update profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleFeature = async () => {
    if (!user || userData?.tier !== 'premium') return;
    const newStatus = !userData.isFeatured;
    try {
      await updateDoc(doc(db, "users", user.uid), { isFeatured: newStatus });
      setUserData({ ...userData, isFeatured: newStatus });
    } catch (error) {
      console.error("Error updating feature status:", error);
    }
  };

  // --- UI: LOADING ---
  if (isLoading) return <div className="min-h-screen flex items-center justify-center font-black text-2xl uppercase">Loading Profile...</div>;

  const isPremium = userData?.tier === "premium";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-20">
      
      {/* 1. MASTER HEADER (Unified Hamburger Menu) */}
      <header className="bg-black text-white border-b-4 border-black sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-20 flex justify-between items-center bg-black relative z-50">
          <Link href="/dashboard" className="font-black text-2xl tracking-tighter cursor-pointer hover:opacity-80 transition-opacity">
            <span className="text-white">OKI</span><span className="text-[#22c55e]">CONSTRUCT</span>
          </Link>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="flex items-center gap-2 text-white font-black text-xl hover:text-[#22c55e] transition-colors">
            <span className="text-sm tracking-widest uppercase hidden md:inline-block">Menu</span>
            <span className="text-2xl">{isMobileMenuOpen ? "✕" : "☰"}</span>
          </button>
        </div>

        {isMobileMenuOpen && (
          <nav className="absolute top-full left-0 w-full bg-gray-900 border-b-4 border-black flex flex-col p-6 gap-4 animate-in slide-in-from-top-2 shadow-[0px_10px_0px_0px_rgba(0,0,0,1)] z-40">
            <div className="max-w-[1400px] mx-auto w-full flex flex-col gap-4">
              <Link href="/estimate-boq" className="font-black text-sm md:text-base uppercase hover:text-[#22c55e] border-b border-gray-800 pb-3 transition-colors">Estimate BOQ</Link>
              <Link href="/track-expenditure" className="font-black text-sm md:text-base uppercase hover:text-[#22c55e] border-b border-gray-800 pb-3 transition-colors">Track Expenditure</Link>
              <Link href="/contact-experts" className="font-black text-sm md:text-base uppercase hover:text-[#22c55e] border-b border-gray-800 pb-3 transition-colors">Contact Experts</Link>
              {isPremium && <Link href="/custom-settings" className="font-black text-sm md:text-base uppercase text-[#22c55e] border-b border-gray-800 pb-3 hover:text-white transition-colors">⚙️ Custom Rates</Link>}
              <Link href="/profile" className="font-black text-sm md:text-base uppercase text-white border-b border-gray-800 pb-3 transition-colors">My Profile</Link>
              <button onClick={handleLogout} className="font-black text-sm md:text-base uppercase text-red-500 text-left pt-2 hover:text-white transition-colors w-fit">Logout ➔</button>
            </div>
          </nav>
        )}
      </header>

      <main className="max-w-[1400px] mx-auto p-4 md:p-6 mt-10 w-full flex-grow">
        
        {/* HERO SECTION */}
        <div className="mb-10 flex flex-col md:flex-row items-center md:items-end gap-6 border-b-8 border-black pb-8">
          <div className="w-32 h-32 bg-white border-4 border-black flex items-center justify-center overflow-hidden shrink-0 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            {userData?.avatar?.length > 5 ? (
              <img src={userData.avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="text-6xl">{userData?.avatar || "👤"}</span>
            )}
          </div>
          <div className="text-center md:text-left">
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-black">{userData?.name || 'User'}</h1>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-2">
              <span className="font-black text-sm uppercase tracking-widest text-gray-500 border-2 border-gray-300 px-3 py-1">{userData?.role}</span>
              {isPremium ? (
                <span className="font-black text-sm uppercase tracking-widest text-black bg-[#22c55e] border-2 border-black px-3 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">PREMIUM ACCOUNT</span>
              ) : (
                <span className="font-black text-sm uppercase tracking-widest text-gray-600 bg-gray-200 border-2 border-gray-400 px-3 py-1">STANDARD TIER</span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN: IDENTITY & SETTINGS */}
          <div className="lg:col-span-4 space-y-8">
            
            {/* Personal Details Form */}
            <div className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
              <h2 className="font-black text-xl uppercase mb-6 border-b-4 border-[#22c55e] pb-2 inline-block">Personal Details</h2>
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Email Address (Read Only)</label>
                  <input type="email" readOnly disabled className="w-full border-2 border-gray-300 bg-gray-100 p-3 font-bold mt-1 text-gray-500 cursor-not-allowed" value={userData?.email || ""} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest">Full Name / Firm Name</label>
                  <input type="text" required className="w-full border-2 border-black p-3 font-bold mt-1" value={editName} onChange={e => setEditName(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest">Phone Number</label>
                  <input type="tel" required className="w-full border-2 border-black p-3 font-bold mt-1" value={editPhone} onChange={e => setEditPhone(e.target.value)} />
                </div>
                <button type="submit" disabled={isSaving} className="w-full bg-black text-white border-4 border-black p-4 font-black uppercase hover:bg-[#22c55e] hover:text-black transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-y-1 mt-4">
                  {isSaving ? "Saving..." : "Update Details"}
                </button>
              </form>
            </div>

            {/* PREMIUM VIP SECTION */}
            {isPremium && (
              <div className="bg-black text-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(34,197,94,1)]">
                <h2 className="font-black text-xl uppercase mb-2 text-[#22c55e]">VIP Control Panel</h2>
                <p className="font-bold text-xs text-gray-400 uppercase tracking-widest mb-6">Exclusive Premium Features</p>
                
                <div className="space-y-6">
                  {/* Feature Profile Toggle */}
                  <div className="bg-gray-900 border-2 border-gray-700 p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-black uppercase text-sm">Directory Visibility</h3>
                      <span className={`text-[10px] font-black uppercase px-2 py-1 ${userData?.isFeatured ? 'bg-[#22c55e] text-black' : 'bg-gray-700 text-gray-300'}`}>
                        {userData?.isFeatured ? "Currently Featured" : "Standard Listing"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 font-bold mb-4">Display your profile at the very top of the Expert Directory to attract more clients.</p>
                    <button onClick={handleToggleFeature} className={`w-full border-2 p-3 font-black uppercase text-sm transition-colors ${userData?.isFeatured ? 'border-red-500 text-red-500 hover:bg-red-500 hover:text-white' : 'border-[#22c55e] text-[#22c55e] hover:bg-[#22c55e] hover:text-black'}`}>
                      {userData?.isFeatured ? "Remove from Featured" : "Feature My Profile 🌟"}
                    </button>
                  </div>

                  {/* Custom Settings Router */}
                  <div className="bg-gray-900 border-2 border-gray-700 p-4">
                    <h3 className="font-black uppercase text-sm mb-2">Custom Material Engine</h3>
                    <p className="text-xs text-gray-400 font-bold mb-4">Override admin defaults. Set your own concrete ratios, TMT bar weights, and structural formulas.</p>
                    <Link href="/custom-settings" className="block w-full text-center bg-white text-black border-2 border-white p-3 font-black uppercase text-sm hover:bg-gray-200 transition-colors">
                      Configure Rates ➔
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: DATA DASHBOARD */}
          <div className="lg:col-span-8">
            <div className="bg-white border-4 border-black p-6 lg:p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] min-h-full">
              <div className="flex justify-between items-end border-b-4 border-black pb-4 mb-6">
                <h2 className="font-black text-2xl uppercase">Project Workspace</h2>
                <span className="font-black text-xs uppercase bg-black text-white px-2 py-1">{projects.length} Total</span>
              </div>

              {projects.length === 0 ? (
                <div className="py-20 text-center border-4 border-dashed border-gray-300 bg-gray-50">
                  <h3 className="text-2xl font-black uppercase text-gray-400 mb-2">No Projects Yet</h3>
                  <p className="font-bold text-gray-500 text-sm max-w-sm mx-auto mb-6">You haven't created any BOQ Estimates or Expenditure tracking ledgers yet.</p>
                  <div className="flex justify-center gap-4">
                    <Link href="/estimate-boq" className="bg-black text-white px-6 py-3 font-black uppercase text-sm hover:bg-[#22c55e] hover:text-black transition-colors">Start BOQ</Link>
                    <Link href="/track-expenditure" className="bg-white text-black border-4 border-black px-6 py-3 font-black uppercase text-sm hover:bg-gray-100 transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-y-1">Track Expenses</Link>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {projects.map((proj) => (
                    <div key={proj.id} className="border-4 border-black p-5 hover:bg-gray-50 transition-colors group relative">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="font-black text-xl uppercase truncate pr-4">{proj.projectName}</h3>
                        {proj.isManualTracker ? (
                          <span title="Manual Ledger" className="text-2xl grayscale group-hover:grayscale-0 transition-all">📊</span>
                        ) : (
                          <span title="BOQ Estimate" className="text-2xl grayscale group-hover:grayscale-0 transition-all">🏗️</span>
                        )}
                      </div>
                      
                      <div className="space-y-1 mb-6">
                        <p className="text-xs font-black uppercase text-gray-500">Total Budget Limit</p>
                        <p className="text-lg font-black text-[#22c55e]">₹{(proj.grandTotal || 0).toLocaleString()}</p>
                      </div>

                      <div className="absolute bottom-4 right-4 text-[10px] font-black uppercase text-gray-400">
                        {new Date(proj.createdAt?.toMillis() || Date.now()).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}