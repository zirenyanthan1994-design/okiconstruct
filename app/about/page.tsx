"use client";
import React from 'react';
import Navbar from '../components/Navbar';
import Link from 'next/link';

export default function About() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <Navbar />

      <main className="max-w-4xl mx-auto p-4 md:p-8 mt-8 w-full flex-grow animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        <div className="bg-white border border-gray-100 rounded-3xl p-8 md:p-12 shadow-sm relative overflow-hidden">
          
          {/* Decorative Top Border */}
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#22c55e] to-[#16a34a]"></div>

          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-green-50 text-[#22c55e] rounded-2xl flex items-center justify-center mx-auto mb-6 text-4xl shadow-sm">
              🏢
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight mb-4">
              Building Better, Together.
            </h1>
            <p className="text-lg font-medium text-gray-500 uppercase tracking-widest">
              The Story of OkiConstruct
            </p>
          </div>

          <div className="space-y-6 text-gray-600 text-lg leading-relaxed font-medium">
            <p>
              At OkiConstruct, we believe that managing a construction project shouldn't be as complex as building one. 
            </p>
            <p>
              Whether you are a homeowner building your dream house, a contractor managing multiple sites, or an architect delivering precise client pitches, the traditional methods of budgeting are broken. Spreadsheets get messy, manual calculations lead to material shortages, and tracking daily expenses turns into an administrative nightmare.
            </p>
            <p>
              <strong className="text-gray-900">That is why we built OkiConstruct.</strong>
            </p>
            <p>
              We are a modern, cloud-powered platform designed to instantly translate your floor plans into highly accurate Bills of Quantities (BOQ). Our smart engine calculates everything from footing concrete to the exact number of paint buckets you need. 
            </p>
            <p>
              But we didn't stop at estimation. We integrated a real-time Expense Tracker, allowing you to monitor actual spending against your budget, track profit margins, and instantly generate professional, branded PDF invoices for your clients.
            </p>
          </div>

          {/* Mission Statement Box */}
          <div className="mt-12 bg-gray-900 text-white p-8 rounded-2xl shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#22c55e]/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
            <h3 className="text-xl font-black text-[#22c55e] uppercase tracking-widest mb-3 relative z-10">Our Mission</h3>
            <p className="text-xl md:text-2xl font-semibold leading-snug relative z-10">
              To bring transparency, speed, and precision to the construction industry, giving professionals and homeowners the tools they need to build with confidence.
            </p>
          </div>

          {/* Back Navigation */}
          <div className="mt-12 text-center">
            <Link href="/" className="inline-flex items-center gap-2 font-bold text-gray-500 hover:text-gray-900 transition-colors bg-gray-50 px-6 py-3 rounded-xl border border-gray-200 hover:border-gray-300">
              ⬅ Back to Home
            </Link>
          </div>

        </div>
      </main>
    </div>
  );
}