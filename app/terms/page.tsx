"use client";
import React from 'react';
import Navbar from '../components/Navbar';
import Link from 'next/link';

export default function TermsAndConditions() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <Navbar />

      <main className="max-w-4xl mx-auto p-4 md:p-8 mt-8 w-full flex-grow animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        <div className="bg-white border border-gray-100 rounded-3xl p-8 md:p-12 shadow-sm relative overflow-hidden">
          
          {/* Decorative Top Border */}
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#22c55e] to-[#16a34a]"></div>

          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-green-50 text-[#22c55e] rounded-2xl flex items-center justify-center mx-auto mb-6 text-4xl shadow-sm">
              ⚖️
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight mb-4">
              Terms and Conditions
            </h1>
            <p className="text-lg font-medium text-gray-500">
              Effective Date: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>

          <div className="space-y-8 text-gray-600 font-medium leading-relaxed">
            
            <p className="text-gray-900 font-bold text-lg bg-gray-50 p-4 rounded-xl border border-gray-100">
              Welcome to OkiConstruct. By using our website and software platform, you agree to comply with and be bound by the following Terms and Conditions.
            </p>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b border-gray-100 pb-2">1. Service Description</h2>
              <p>
                OkiConstruct provides software tools for construction estimation (BOQ) and expense tracking. While our engine utilizes industry-standard formulas to calculate concrete ratios, steel weights, and masonry requirements, <strong className="text-[#15803d] bg-green-50 px-2 py-1 rounded">these outputs are estimates only.</strong>
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b border-gray-100 pb-2">2. Limitation of Liability</h2>
              <ul className="list-disc pl-6 space-y-4">
                <li>
                  <strong className="text-gray-900 block mb-1">No Engineering Guarantee:</strong> 
                  OkiConstruct is not a substitute for a licensed architect, structural engineer, or quantity surveyor. You agree that OkiConstruct is not liable for any structural failures, material shortages, material overages, or financial losses resulting from the use of our calculations.
                </li>
                <li>
                  <strong className="text-gray-900 block mb-1">Market Fluctuations:</strong> 
                  Users are responsible for inputting accurate local material and labor rates. We are not responsible for budget overruns caused by market price fluctuations or incorrect data entry.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b border-gray-100 pb-2">3. Accounts & Premium Subscriptions</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
                <li>Premium features (such as profit margin tracking and custom structural ratios) require an active subscription. We reserve the right to modify subscription pricing with prior notice.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b border-gray-100 pb-2">4. Acceptable Use</h2>
              <p>
                You agree to use the platform exclusively for its intended professional purpose. You may not attempt to reverse-engineer the calculation engine, scrape data, or disrupt the cloud infrastructure hosting the platform.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b border-gray-100 pb-2">5. Modifications</h2>
              <p>
                OkiConstruct reserves the right to update these terms or modify platform features at any time to improve the user experience and ensure security.
              </p>
            </section>

          </div>

          {/* Back Navigation */}
          <div className="mt-12 text-center pt-8 border-t border-gray-100">
            <Link href="/" className="inline-flex items-center gap-2 font-bold text-gray-500 hover:text-gray-900 transition-colors bg-gray-50 px-6 py-3 rounded-xl border border-gray-200 hover:border-gray-300">
              ⬅ Back to Home
            </Link>
          </div>

        </div>
      </main>
    </div>
  );
}