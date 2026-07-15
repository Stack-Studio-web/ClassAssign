import axios from 'axios'
import { API_BASE_URL } from './config'

/**
 * POST /generate-seating
 * @param {{ venues: object[], students: object[], allow_adjacent_override: boolean, venue_fill_order?: string }} payload
 */
export async function generateSeating(payload) {
  try {
    const { data } = await axios.post(`${API_BASE_URL}/generate-seating`, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000,
    })
    return { ok: true, data }
  } catch (err) {
    if (err.response) {
      const status = err.response.status
      const detail = err.response.data?.detail
      let message = `Server error (${status})`
      if (typeof detail === 'string') {
        message = detail
      } else if (Array.isArray(detail)) {
        // FastAPI 422 validation errors
        message = detail
          .map((d) => `${(d.loc || []).slice(1).join('.') || 'field'}: ${d.msg}`)
          .join('; ')
      } else if (err.response.data?.message) {
        message = err.response.data.message
      }
      return { ok: false, error: message, status }
    }
    if (err.code === 'ECONNABORTED') {
      return { ok: false, error: 'Request timed out — solver may still be running.' }
    }
    return {
      ok: false,
      error: `Cannot reach backend at ${API_BASE_URL}. Is uvicorn running?`,
    }
  }
}
