// src/components/WaterConsumptionChart.jsx
import { useEffect, useRef } from 'react';

export default function WaterConsumptionChart({ bills }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!bills || bills.length === 0 || !canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    const canvas = canvasRef.current;
    
    // Set canvas dimensions
    const width = canvas.parentElement.clientWidth;
    canvas.width = width;
    canvas.height = 250;

    // Get last 6 months of bills
    const recentBills = [...bills]
      .sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate))
      .slice(0, 6)
      .reverse();

    if (recentBills.length === 0) return;

    // Chart dimensions
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = canvas.height - padding * 2;
    const barWidth = (chartWidth / recentBills.length) * 0.6;
    const barSpacing = (chartWidth / recentBills.length) * 0.4;

    // Clear canvas
    ctx.clearRect(0, 0, width, canvas.height);

    // Find max consumption for scaling
    const maxConsumption = Math.max(...recentBills.map(b => b.consumed || 0), 10);

    // Draw grid lines
    ctx.beginPath();
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 1;

    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
      const y = padding + (chartHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.strokeStyle = '#E5E7EB';
      ctx.stroke();

      // Value labels
      ctx.fillStyle = '#6B7280';
      ctx.font = '10px Poppins';
      ctx.textAlign = 'right';
      const value = Math.round((maxConsumption / 5) * (5 - i));
      ctx.fillText(`${value} m³`, padding - 5, y - 5);
    }

    // Draw bars
    recentBills.forEach((bill, index) => {
      const x = padding + index * (barWidth + barSpacing) + barSpacing / 2;
      const barHeight = (bill.consumed / maxConsumption) * chartHeight;
      const y = canvas.height - padding - barHeight;

      // Bar gradient
      const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
      gradient.addColorStop(0, '#10B981');
      gradient.addColorStop(1, '#059669');

      // Draw bar
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barWidth, barHeight);

      // Bar border radius
      ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
      
      // Period label
      ctx.fillStyle = '#4B5563';
      ctx.font = '11px Poppins';
      ctx.textAlign = 'center';
      ctx.shadowBlur = 0;
      ctx.fillText(bill.periodCovered?.split('-')[1] || '', x + barWidth / 2, canvas.height - padding + 20);

      // Consumption value on top of bar
      ctx.fillStyle = '#1F2937';
      ctx.font = 'bold 12px Poppins';
      ctx.textAlign = 'center';
      ctx.fillText(`${bill.consumed} m³`, x + barWidth / 2, y - 10);

      // Status indicator
      if (bill.status === 'overdue') {
        ctx.fillStyle = '#EF4444';
        ctx.beginPath();
        ctx.arc(x + barWidth / 2, y - 25, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (bill.status === 'paid') {
        ctx.fillStyle = '#10B981';
        ctx.beginPath();
        ctx.arc(x + barWidth / 2, y - 25, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Draw baseline
    ctx.beginPath();
    ctx.strokeStyle = '#9CA3AF';
    ctx.lineWidth = 2;
    ctx.moveTo(padding, canvas.height - padding);
    ctx.lineTo(width - padding, canvas.height - padding);
    ctx.stroke();

  }, [bills]);

  if (!bills || bills.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
        <div className="text-center">
          <i className="fas fa-chart-bar text-4xl text-gray-300 mb-2"></i>
          <p className="text-gray-500">No consumption data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-64 relative">
      <canvas 
        ref={canvasRef} 
        className="w-full h-full"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
    </div>
  );
}