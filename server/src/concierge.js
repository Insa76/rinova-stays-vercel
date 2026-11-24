import { first, execute } from './db.js';

const normalize = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export async function answerConcierge({ message, propertyId, name = '', email = '', phone = '' }) {
  const q = normalize(message);
  const p = propertyId ? await first('SELECT * FROM properties WHERE id = $1 AND active = 1', [propertyId]) : null;
  let answer = '';
  let escalated = false;

  if (/precio|cuanto|tarifa|costo/.test(q)) {
    answer = p
      ? `El valor de ${p.title} es ${p.currency} ${Number(p.price_per_night).toLocaleString('es-AR')} por noche. La limpieza tiene un costo de ${p.currency} ${Number(p.cleaning_fee).toLocaleString('es-AR')}. El total final depende de las fechas y la cantidad de huéspedes.`
      : 'Los precios varían según la propiedad y las fechas. Decime cuál te interesa y puedo orientarte.';
  } else if (/disponib|fecha|libre|reserv/.test(q)) {
    answer = 'Puedo ayudarte a consultar disponibilidad. Elegí las fechas en la ficha de la propiedad y el sistema verificará si están libres. La solicitud queda registrada y el anfitrión confirma la reserva.';
  } else if (/check.?in|ingreso|entrada|check.?out|salida|horario/.test(q)) {
    answer = 'El horario habitual de ingreso es desde las 14:00 y la salida hasta las 10:00. Si necesitás otro horario, puedo dejar la consulta al anfitrión para que lo confirme.';
  } else if (/wifi|internet|mascota|perro|gato|cochera|estacionamiento|aire|cocina|ropa blanca|sabanas/.test(q)) {
    answer = p
      ? `En esta propiedad contamos con: ${JSON.parse(p.amenities).join(', ')}. Para confirmar una excepción o un requerimiento especial, puedo consultar al anfitrión.`
      : 'Cada propiedad tiene servicios diferentes. Seleccioná una propiedad para ver sus comodidades.';
  } else if (/ubicacion|direccion|donde queda|zona|barrio/.test(q)) {
    answer = p
      ? `${p.title} está en ${p.address}, barrio ${p.neighborhood}, ${p.city}. En la ficha tenés el mapa y la ubicación.`
      : 'Cada alojamiento muestra su dirección aproximada y mapa en la ficha. ¿Qué propiedad querés consultar?';
  } else if (/cancel|reembolso|devolucion|modificar|cambiar reserva|factura|pago|transferencia|efectivo|descuento|reclamo|problema|urgente|humano|persona|dueño|dueno/.test(q)) {
    answer = 'Esta consulta necesita confirmación del anfitrión. Ya la puedo dejar registrada para que se comunique con vos.';
    escalated = true;
  } else {
    answer = 'Puedo responder consultas sobre precios, ubicación, comodidades, horarios y cómo consultar disponibilidad. Para pedidos especiales, pagos, cambios o situaciones particulares, dejo el mensaje al anfitrión.';
  }

  // Ollama sólo funciona si el servidor remoto puede alcanzar el servicio configurado.
  // En Vercel no se presupone acceso a la Ollama instalada en la PC del propietario.
  if (process.env.OLLAMA_ENABLED === 'true' && process.env.OLLAMA_URL) {
    try {
      const prompt = `Sos Concierge IA de Rinova Stays. Respondé en español rioplatense, con amabilidad y precisión. No inventes datos ni confirmes reservas. Si falta información, indicá que debe confirmarlo el anfitrión. Datos de propiedad: ${p ? JSON.stringify({ title: p.title, description: p.description, address: p.address, price: p.price_per_night, amenities: JSON.parse(p.amenities) }) : 'No seleccionada'}. Respuesta base: ${answer}. Consulta: ${message}`;
      const response = await fetch(process.env.OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.OLLAMA_MODEL || 'llama3:latest', messages: [{ role: 'user', content: prompt }], stream: false }),
        signal: AbortSignal.timeout(12000)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.message?.content) answer = data.message.content.trim();
      }
    } catch {
      // Se conserva la respuesta local si el proveedor de IA no está disponible.
    }
  }

  await execute(
    'INSERT INTO conversations(name,email,phone,property_id,question,answer,escalated) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [name || 'Visitante', email || '', phone || '', propertyId || null, message, answer, escalated ? 1 : 0]
  );
  return { answer, escalated };
}
