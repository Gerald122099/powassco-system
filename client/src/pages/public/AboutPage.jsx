// src/pages/public/AboutPage.jsx
import Navbar from "../../components/Navbar";
import logo from "../../assets/logo.png";

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-100 pt-24 pb-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl bg-white border border-green-100 shadow-lg p-8">
            <div className="flex items-center gap-4 mb-6">
              <img src={logo} alt="POWASSCO Logo" className="h-20 w-20 rounded-2xl" />
              <div>
                <h1 className="text-3xl font-bold text-gray-800">About POWASSCO</h1>
                <p className="text-green-600">Multipurpose Cooperative</p>
              </div>
            </div>

            <div className="space-y-6">
              <p className="text-gray-600 leading-relaxed">
                POWASSCO Multipurpose Cooperative is a member-owned organization dedicated to providing sustainable water management and financial services to our community. Established in 1995, we have been serving our members for over 25 years.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-green-50 p-6 rounded-2xl">
                  <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <i className="fas fa-bullseye text-green-600"></i>
                    Our Mission
                  </h3>
                  <p className="text-gray-600">To provide reliable and sustainable water services while promoting cooperative values and community development.</p>
                </div>

                <div className="bg-green-50 p-6 rounded-2xl">
                  <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <i className="fas fa-eye text-green-600"></i>
                    Our Vision
                  </h3>
                  <p className="text-gray-600">To be the leading cooperative in water management and community empowerment in the region.</p>
                </div>
              </div>

              <div className="border-t border-green-100 pt-6">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <i className="fas fa-hand-holding-heart text-green-600"></i>
                  Core Values
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <i className="fas fa-handshake text-3xl text-green-600 mb-2"></i>
                    <p className="font-semibold">Integrity</p>
                  </div>
                  <div className="text-center">
                    <i className="fas fa-users text-3xl text-green-600 mb-2"></i>
                    <p className="font-semibold">Unity</p>
                  </div>
                  <div className="text-center">
                    <i className="fas fa-leaf text-3xl text-green-600 mb-2"></i>
                    <p className="font-semibold">Sustainability</p>
                  </div>
                  <div className="text-center">
                    <i className="fas fa-heart text-3xl text-green-600 mb-2"></i>
                    <p className="font-semibold">Service</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}