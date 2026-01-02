/* Extended booking and UI management for Aero Trust */
(() => {
  'use strict';

  /* ------------------------------
     DOM references
  ------------------------------ */
  const form = document.getElementById('booking-form');
  const previewBtn = document.getElementById('previewBtn');
  const summaryModalEl = document.getElementById('summaryModal');
  const summaryContent = document.getElementById('summaryContent');
  const confirmBtn = document.getElementById('confirmBooking');
  const saveDraft = document.getElementById('saveDraft');
  const seatSelectBtn = document.getElementById('seatSelect');
  const seatModalEl = document.getElementById('seatModal');
  const seatMapEl = document.getElementById('seatMap');
  const applySeatsBtn = document.getElementById('applySeats');
  const bookingsListEl = document.getElementById('bookingsList');
  const searchBookings = document.getElementById('searchBookings');
  const exportCsv = document.getElementById('exportCsv');
  const clearBookings = document.getElementById('clearBookings');
  const destinationCards = document.querySelectorAll('.destination');
  const modal = new bootstrap.Modal(summaryModalEl);
  const seatModal = seatModalEl ? new bootstrap.Modal(seatModalEl) : null;

  /* ------------------------------
     Simple in-memory state
  ------------------------------ */
  let selectedSeats = []; // array of strings like "1A"

  /* ------------------------------
     Sample flight data (for demo) - used by search/render helpers
  ------------------------------ */
  const sampleFlights = [
    {id: 'FT100', from: 'Lagos', to: 'London', depart: '2025-12-28', class: 'economy', price: 350},
    {id: 'FT200', from: 'Abuja', to: 'Dubai', depart: '2025-12-29', class: 'business', price: 900},
    {id: 'FT300', from: 'Enugu', to: 'Johannesburg', depart: '2026-01-05', class: 'economy', price: 420}
  ];

  // seat pricing per class (demo)
  const seatPricing = { economy: 50, business: 100, first: 200 };

  /* ------------------------------
     Utilities
  ------------------------------ */
  function escapeHtml(str){
    return String(str || '').replace(/[&<>\"']/g, (s) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[s]);
  }
  function formatPrice(n){
    return '₦' + Number(n).toLocaleString();
  }
  function debounce(fn, wait=300){
    let t; return (...args)=>{ clearTimeout(t); t = setTimeout(()=>fn(...args), wait); };
  }

  /* ------------------------------
     Form helpers
  ------------------------------ */
  function getFormData(){
    const data = Object.fromEntries(new FormData(form).entries());
    data.passengers = Number(data.passengers) || 1;
    data.seats = selectedSeats.slice();
    return data;
  }

  function estimateFare(data){
    const base = 200; // demo base fare
    const klass = data.class || 'economy';
    const mult = klass === 'business' ? 2 : (klass === 'first' ? 3.5 : 1);
    const passengers = data.passengers || 1;
    const seatsCount = (data.seats || []).length || 0;
    const seatTotal = (seatPricing[klass] || seatPricing.economy) * seatsCount;
    // simple fare scaled by passengers plus seat price total
    return Math.round(base * mult * passengers + seatTotal);
  }

  function buildSummaryHTML(data){
    const price = estimateFare(data);
    const klass = data.class || 'economy';
    const seats = (data.seats || []).slice();
    const seatEach = seatPricing[klass] || seatPricing.economy;
    const seatTotal = seatEach * seats.length;
    return `
      <p><strong>Passenger:</strong> ${escapeHtml(data.name || '-')}</p>
      <p><strong>Route:</strong> ${escapeHtml(data.from || '-')} → ${escapeHtml(data.to || '-')}</p>
      <p><strong>Departure:</strong> ${escapeHtml(data.depart || '-')}</p>
      <p><strong>Return:</strong> ${escapeHtml(data.return || 'One-way')}</p>
      <p><strong>Passengers:</strong> ${data.passengers}</p>
      <p><strong>Class:</strong> ${escapeHtml(data.class)}</p>
      <p><strong>Seats:</strong> ${escapeHtml(seats.join(', ') || 'None')}</p>
      ${seats.length? `<p class="small text-muted">Seat price: ${formatPrice(seatEach)} × ${seats.length} = <strong>${formatPrice(seatTotal)}</strong></p>`: ''}
      <p><strong>Email:</strong> ${escapeHtml(data.email || '-')}</p>
      <hr>
      <p class="h5">Estimated fare: <strong>${formatPrice(price)}</strong></p>
    `;
  }

  /* ------------------------------
     Modal interactions
  ------------------------------ */
  function showSummary(data){
    summaryContent.innerHTML = buildSummaryHTML(data);
    modal.show();
  }

  confirmBtn.addEventListener('click', () => {
    const data = getFormData();
    const bookings = JSON.parse(localStorage.getItem('aeroBookings') || '[]');
    bookings.push({...data, id: Date.now(), price: estimateFare(data)});
    localStorage.setItem('aeroBookings', JSON.stringify(bookings));
    console.log('Booking saved (localStorage):', bookings[bookings.length-1]);
    modal.hide();
    showToast('Booking confirmed — saved locally (demo).');
    form.reset(); selectedSeats = [];
    updateSeatButtonLabel();
    renderSelectedSeats();
    localStorage.removeItem('aeroDraft');
    // go to last page to show new booking
    currentPage = Math.ceil(bookings.length / PAGE_SIZE) || 1;
    renderBookingsList();
  });

  // Preview handler: validate form then show summary
  previewBtn.addEventListener('click', (e) => {
    if (!form.checkValidity()){
      form.classList.add('was-validated');
      return;
    }
    const data = getFormData();
    showSummary(data);
  });

  // Save draft
  saveDraft.addEventListener('click', () => {
    const data = getFormData();
    localStorage.setItem('aeroDraft', JSON.stringify(data));
    showToast('Draft saved locally.');
  });

  /* ------------------------------
     Seat map (demo) - generate and handle selection
     Supports marking seats already booked (from localStorage) and a read-only check mode.
  ------------------------------ */
  function getBookedSeats(){
    const bookings = JSON.parse(localStorage.getItem('aeroBookings') || '[]');
    const s = new Set();
    bookings.forEach(b => { (b.seats||[]).forEach(se => s.add(se)); });
    return Array.from(s);
  }

  function renderSeatMap(rows=8, cols=6, opts={markBooked:true, readOnly:false}){
    if (!seatMapEl) return;
    seatMapEl.innerHTML = '';
    const booked = opts.markBooked ? getBookedSeats() : [];
    // toggle read-only visual state on the map container
    if (opts.readOnly) seatMapEl.classList.add('read-only'); else seatMapEl.classList.remove('read-only');

    for (let r=1; r<=rows; r++){
      for (let c=0; c<cols; c++){
        const label = `${r}${String.fromCharCode(65+c)}`; // 1A, 1B...
        const div = document.createElement('button');
        div.type = 'button';
        div.className = 'seat btn btn-sm';
        div.dataset.seat = label;
        div.textContent = label;
        // mark occupied if this seat was booked in saved bookings
        if (booked.includes(label)) div.classList.add('occupied');
        // small extra randomness for demo when not relying on bookings
        if (!opts.markBooked && Math.random() < 0.03) div.classList.add('occupied');
        // pre-apply previously selected seats when rendering map
        if (selectedSeats.includes(label) && !div.classList.contains('occupied')) div.classList.add('selected');

        // only attach interactive handlers when not in read-only mode
        if (!opts.readOnly){
          div.addEventListener('click', (e)=>{
            if (div.classList.contains('occupied')) return;
            div.classList.toggle('selected');
            const s = div.dataset.seat;
            if (div.classList.contains('selected')) {
              if (!selectedSeats.includes(s)) selectedSeats.push(s);
            } else selectedSeats = selectedSeats.filter(x=>x!==s);
          });
        }
        seatMapEl.appendChild(div);
      }
    }
  }

  const checkSeatsBtn = document.getElementById('checkSeats');

  if (seatSelectBtn && seatModal){
    seatSelectBtn.addEventListener('click', ()=>{ 
      // interactive seat selection mode (applies to the current booking)
      renderSeatMap(8,6,{markBooked:true, readOnly:false}); 
      // ensure apply button is visible for selection
      applySeatsBtn && (applySeatsBtn.style.display = '');
      document.getElementById('seatModalNote')?.classList.add('d-none');
      seatModal.show(); 
    });

    applySeatsBtn.addEventListener('click', ()=>{ 
      // apply seats, close modal and update UI
      seatModal.hide(); 
      showToast(`Seats saved: ${selectedSeats.join(', ') || 'none'}`); 
      updateSeatButtonLabel();
      renderSelectedSeats();
      // if summary modal is open, refresh its content to show seats
      if (document.getElementById('summaryModal')?.classList.contains('show')){
        summaryContent.innerHTML = buildSummaryHTML(getFormData());
      }
    });

    // check seats (read-only occupancy view)
    if (checkSeatsBtn){
      checkSeatsBtn.addEventListener('click', ()=>{
        // mark seats already booked and show them read-only
        renderSeatMap(8,6,{markBooked:true, readOnly:true});
        // hide apply and show a short note
        applySeatsBtn && (applySeatsBtn.style.display = 'none');
        document.getElementById('seatModalNote')?.classList.remove('d-none');
        seatModal.show();
      });
    }

    // ensure note is hidden and apply visible when opening from summary modal choose seats
    const modalChooseSeatsBtn = document.getElementById('modalChooseSeats');
    if (modalChooseSeatsBtn && seatModal){
      modalChooseSeatsBtn.addEventListener('click', ()=>{ 
        // render current seat selections with selectedSeats pre-applied
        renderSeatMap(8,6,{markBooked:true, readOnly:false});
        applySeatsBtn && (applySeatsBtn.style.display = '');
        document.getElementById('seatModalNote')?.classList.add('d-none');
        // mark already selected seats
        setTimeout(()=>{
          selectedSeats.forEach(s => {
            const btn = seatMapEl.querySelector(`[data-seat="${s}"]`);
            if (btn && !btn.classList.contains('occupied')) btn.classList.add('selected');
          });
        }, 80);
        seatModal.show();
      });
    }

    // when modal hides, restore apply button visibility
    seatModalEl.addEventListener('hidden.bs.modal', ()=>{
      applySeatsBtn && (applySeatsBtn.style.display = '');
      document.getElementById('seatModalNote')?.classList.add('d-none');
    });
  }

  // summary modal: choose seats from modal
  const modalChooseSeatsBtn = document.getElementById('modalChooseSeats');
  if (modalChooseSeatsBtn && seatModal){
    modalChooseSeatsBtn.addEventListener('click', ()=>{ 
      // render current seat selections with selectedSeats pre-applied
      renderSeatMap();
      // mark already selected seats
      setTimeout(()=>{
        selectedSeats.forEach(s => {
          const btn = seatMapEl.querySelector(`[data-seat="${s}"]`);
          if (btn && !btn.classList.contains('occupied')) btn.classList.add('selected');
        });
      }, 80);
      seatModal.show();
    });
  }

  // helper to update the Choose Seats button label in the form
  function updateSeatButtonLabel(){
    if (!seatSelectBtn) return;
    const n = selectedSeats.length || 0;
    seatSelectBtn.innerText = n ? `Choose Seats (${n})` : 'Choose Seats';
  }

  function renderSelectedSeats(){
    const container = document.getElementById('selectedSeats');
    if (!container) return;
    container.innerHTML = '';
    (selectedSeats || []).forEach(s => {
      const span = document.createElement('span');
      span.className = 'badge-seat';
      span.innerHTML = `${escapeHtml(s)} <span class="remove-seat" role="button" aria-label="Remove seat" data-seat="${escapeHtml(s)}">&times;</span>`;
      container.appendChild(span);
    });
    // attach remove handlers
    container.querySelectorAll('.remove-seat').forEach(el => {
      el.addEventListener('click', ()=>{
        const s = el.dataset.seat;
        selectedSeats = selectedSeats.filter(x => x !== s);
        // update map button if present
        const btn = seatMapEl && seatMapEl.querySelector(`[data-seat="${s}"]`);
        if (btn) btn.classList.remove('selected');
        updateSeatButtonLabel();
        renderSelectedSeats();
        if (document.getElementById('summaryModal')?.classList.contains('show')){
          summaryContent.innerHTML = buildSummaryHTML(getFormData());
        }
      });
    });
  }

  function updateSeatPriceInfo(){
    const el = document.getElementById('seatPriceInfo');
    if (!el) return;
    const klass = (form.elements['class'] && form.elements['class'].value) || 'economy';
    el.textContent = `Seat price: ${formatPrice(seatPricing[klass] || seatPricing.economy)} each`;
  }

  // ensure button label reflects any loaded draft
  updateSeatButtonLabel();
  updateSeatPriceInfo();
  renderSelectedSeats();

  // update displayed seat price when class changes
  form.elements['class'] && form.elements['class'].addEventListener('change', ()=>{ updateSeatPriceInfo(); });

  /* ------------------------------
     Bookings list rendering and management (with pagination + edit)
  ------------------------------ */
  const bookingsCountEl = document.getElementById('bookingsCount');
  const bookingsPaginationEl = document.getElementById('bookingsPagination');
  const editBookingModalEl = document.getElementById('editBookingModal');
  const editBookingModal = editBookingModalEl ? new bootstrap.Modal(editBookingModalEl) : null;
  const editForm = document.getElementById('editBookingForm');
  const editId = document.getElementById('editId');
  const editName = document.getElementById('editName');
  const editEmail = document.getElementById('editEmail');
  const editFrom = document.getElementById('editFrom');
  const editTo = document.getElementById('editTo');
  const editDepart = document.getElementById('editDepart');
  const editReturn = document.getElementById('editReturn');
  const editPassengers = document.getElementById('editPassengers');
  const editClass = document.getElementById('editClass');
  const saveEditBookingBtn = document.getElementById('saveEditBooking');
  const confirmDeleteModalEl = document.getElementById('confirmDeleteModal');
  const confirmDeleteModal = confirmDeleteModalEl ? new bootstrap.Modal(confirmDeleteModalEl) : null;
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
  let confirmDeleteTargetId = null;

  const PAGE_SIZE = 6;
  let currentPage = 1;

  function renderBookingsList(filter=''){
    const bookings = JSON.parse(localStorage.getItem('aeroBookings') || '[]');
    console.log('Rendering bookings list — total found:', bookings.length, 'filter:', filter);
    const filtered = bookings.filter(b => !filter || [b.name,b.from,b.to,b.email].join(' ').toLowerCase().includes(filter.toLowerCase()));

    // update counts
    bookingsCountEl && (bookingsCountEl.innerText = `(${filtered.length})`);

    // pagination
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    const rows = pageItems.map(b => `
      <tr data-id="${b.id}">
        <td>${b.id}</td>
        <td>${escapeHtml(b.name)}</td>
        <td>${escapeHtml(b.from)} → ${escapeHtml(b.to)}</td>
        <td>${escapeHtml(b.depart)}</td>
        <td>${escapeHtml(b.return || '—')}</td>
        <td>${escapeHtml(b.class)}</td>
        <td>${b.passengers}</td>
        <td>${formatPrice(b.price)}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary edit me-1">Edit</button>
          <button class="btn btn-sm btn-outline-primary view me-1">View</button>
          <button class="btn btn-sm btn-outline-danger remove">Delete</button>
        </td>
      </tr>
    `).join('');

    bookingsListEl.innerHTML = rows || '<tr><td colspan="9" class="text-muted">No bookings yet</td></tr>';

    // pagination controls
    renderPagination(totalPages, currentPage);

    // attach handlers
    bookingsListEl.querySelectorAll('.remove').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const tr = btn.closest('tr');
        const id = Number(tr.dataset.id);
        // show confirm modal
        confirmDeleteTargetId = id;
        if (confirmDeleteModal) confirmDeleteModal.show(); else {
          if (confirm('Delete booking?')) clearBooking(id);
        }
      });
    });
    bookingsListEl.querySelectorAll('.view').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const tr = btn.closest('tr');
        const id = Number(tr.dataset.id);
        viewBooking(id);
      });
    });
    bookingsListEl.querySelectorAll('.edit').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const tr = btn.closest('tr');
        const id = Number(tr.dataset.id);
        openEditModal(id);
      });
    });
  }

  function renderPagination(totalPages, current){
    if (!bookingsPaginationEl) return;
    bookingsPaginationEl.innerHTML = '';
    const createPageItem = (p, label = null, active = false, disabled = false) => {
      const li = document.createElement('li'); li.className = 'page-item' + (active? ' active':'') + (disabled? ' disabled' : '');
      const a = document.createElement('button'); a.className='page-link'; a.type='button'; a.innerText = label || String(p);
      a.addEventListener('click', ()=>{ if (!disabled) { currentPage = p; renderBookingsList(searchBookings.value || ''); } });
      li.appendChild(a); return li;
    };

    // prev
    bookingsPaginationEl.appendChild(createPageItem(Math.max(1,current-1), 'Prev', false, current===1));

    // show few pages when many
    const maxToShow = 5; let start = Math.max(1, current - 2); let end = Math.min(totalPages, start + maxToShow - 1);
    if (end - start < maxToShow - 1) start = Math.max(1, end - maxToShow + 1);
    for (let p = start; p <= end; p++) bookingsPaginationEl.appendChild(createPageItem(p, null, p===current));

    // next
    bookingsPaginationEl.appendChild(createPageItem(Math.min(totalPages,current+1), 'Next', false, current===totalPages));
  }

  function openEditModal(id){
    const bookings = JSON.parse(localStorage.getItem('aeroBookings') || '[]');
    const b = bookings.find(x=>x.id===id);
    if (!b) return showToast('Booking not found');
    editId.value = b.id;
    editName.value = b.name || '';
    editEmail.value = b.email || '';
    editFrom.value = b.from || '';
    editTo.value = b.to || '';
    editDepart.value = b.depart || '';
    editReturn.value = b.return || '';
    editPassengers.value = b.passengers || 1;
    editClass.value = b.class || 'economy';
    if (editBookingModal) editBookingModal.show();
  }

  saveEditBookingBtn && saveEditBookingBtn.addEventListener('click', ()=>{
    const id = Number(editId.value);
    let bookings = JSON.parse(localStorage.getItem('aeroBookings') || '[]');
    const idx = bookings.findIndex(b=>b.id===id);
    if (idx===-1) return showToast('Booking not found');
    bookings[idx] = {
      ...bookings[idx],
      name: editName.value,
      email: editEmail.value,
      from: editFrom.value,
      to: editTo.value,
      depart: editDepart.value,
      return: editReturn.value,
      passengers: Number(editPassengers.value) || 1,
      class: editClass.value,
      price: estimateFare({class: editClass.value, passengers: Number(editPassengers.value) || 1, seats: bookings[idx].seats || []})
    };
    localStorage.setItem('aeroBookings', JSON.stringify(bookings));
    if (editBookingModal) editBookingModal.hide();
    renderBookingsList(searchBookings.value || '');
    showToast('Booking updated');
  });

  confirmDeleteBtn && confirmDeleteBtn.addEventListener('click', ()=>{
    if (!confirmDeleteTargetId) return; clearBooking(confirmDeleteTargetId); confirmDeleteTargetId = null; if (confirmDeleteModal) confirmDeleteModal.hide();
  });

  function viewBooking(id){
    const bookings = JSON.parse(localStorage.getItem('aeroBookings') || '[]');
    const found = bookings.find(b=>b.id===id);
    if (!found) return showToast('Booking not found');
    showSummary(found);
  }

  function clearBooking(id){
    let bookings = JSON.parse(localStorage.getItem('aeroBookings') || '[]');
    bookings = bookings.filter(b=>b.id!==id);
    localStorage.setItem('aeroBookings', JSON.stringify(bookings));
    // reset page if needed
    renderBookingsList(searchBookings.value || '');
    showToast('Booking removed');
  }

  clearBookings.addEventListener('click', ()=>{
    if (!confirm('Clear all bookings? This cannot be undone (demo).')) return;
    localStorage.removeItem('aeroBookings');
    currentPage = 1;
    renderBookingsList();
    showToast('All bookings cleared');
  });

  /* Export to CSV */
  function exportBookingsCSV(){
    const bookings = JSON.parse(localStorage.getItem('aeroBookings') || '[]');
    if (!bookings.length) return showToast('No bookings to export');
    const header = ['id','name','from','to','depart','return','class','passengers','price','seats','seat_summary','email'];
    const csvRows = [header.join(',')];
    for(const b of bookings){
      const seatsArr = b.seats || [];
      const seatsCell = seatsArr.join('|');
      const seatCount = seatsArr.length;
      const seatPriceEach = seatPricing[b.class] || seatPricing.economy;
      const seatTotal = seatPriceEach * seatCount;
      const seatsSummary = seatCount ? `${seatCount} seat${seatCount>1?'s':''}: ${seatsArr.join(', ')} (${formatPrice(seatTotal)})` : '';
      const row = [b.id,b.name,b.from,b.to,b.depart,b.return||'',b.class,b.passengers,b.price, seatsCell, seatsSummary, b.email];
      csvRows.push(row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','));
    }
    const blob = new Blob([csvRows.join('\n')], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'aero_bookings.csv'; a.click(); URL.revokeObjectURL(url);
    showToast('Bookings exported');
  }
  exportCsv.addEventListener('click', exportBookingsCSV);

  /* Search with debounce */
  searchBookings.addEventListener('input', debounce(()=>{ currentPage = 1; renderBookingsList(searchBookings.value); }, 300));

  /* Pre-fill booking form when clicking a destination card */
  destinationCards.forEach(card=>{
    card.addEventListener('click', ()=>{
      const city = card.dataset.city || '';
      const toInput = form.elements['to'];
      const fromInput = form.elements['from'];
      if (toInput) toInput.value = city;
      if (fromInput && !fromInput.value) fromInput.value = 'Enugu'; // demo default
      showToast(`Destination set to ${city}`);
      // smooth scroll to booking
      document.getElementById('booking').scrollIntoView({behavior:'smooth'});
    });
  });

  /* Load and apply draft */
  function loadDraft(){
    const draft = JSON.parse(localStorage.getItem('aeroDraft') || 'null');
    if (draft){
      Object.entries(draft).forEach(([k,v]) => {
        const el = form.elements[k]; if (el) el.value = v;
      });
      if (draft.seats) selectedSeats = draft.seats.slice();
      updateSeatButtonLabel();
      renderSelectedSeats();
      updateSeatPriceInfo();
      showToast('Loaded saved draft.');
    }
  }

  /* Show small toast */
  function showToast(message){
    const alert = document.createElement('div');
    alert.className = 'alert alert-info position-fixed top-0 start-50 translate-middle-x mt-3 shadow';
    alert.style.zIndex = 1080; alert.role = 'alert'; alert.innerText = message;
    document.body.appendChild(alert);
    setTimeout(()=>{alert.style.opacity=0; alert.style.transition='opacity .5s';},2000);
    setTimeout(()=>alert.remove(),2600);
  }

  /* Form submit: validate and preview */
  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    if (!form.checkValidity()){
      form.classList.add('was-validated');
      return;
    }
    const data = getFormData();
    showSummary(data);
  });

  /* Initialize bookings list */
  renderBookingsList();
  loadDraft();

  /* Debug helpers */
  window.aeroDebug = {
    list: ()=>JSON.parse(localStorage.getItem('aeroBookings')||'[]'),
    clearAll: ()=>{ localStorage.removeItem('aeroBookings'); renderBookingsList(); }
  };

  // additional helpful console logs
  console.log('Aero Trust JS initialized. Sample flights:', sampleFlights);

})();
