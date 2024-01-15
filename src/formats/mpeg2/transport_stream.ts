// 2.4.3 Specification of the transport stream syntax and semantics

import { BitReader, ByteReader, UnexpectedEOFError } from '../../reader.js';
import { parse_af_descriptor } from './af_descriptor.js';

const sync_byte = 0x47;

export class MarkerBitNotOneError extends Error { }
export class ReservedBitNotOneError extends Error { }
export class StuffingByteNotOneError extends Error { }

function marker_bit(r: BitReader) {
  if (r.bslbf(1) !== 1) throw new MarkerBitNotOneError;
}

// 2.1.131 reserved
function reserved_bits(r: BitReader, n: number) {
  for (let i = 0; i < n; i++) {
    if (r.bslbf(1) !== 1) throw new ReservedBitNotOneError;
  }
}

function stuffing_bytes(r: BitReader, n: number) {
  const bytes = r.bytes(n);
  for (let i = 0; i < n; i++) {
    if (bytes[i] !== 0xff) throw new StuffingByteNotOneError;
  }
}

// 2.4.3.4 Adaptation field
export async function parse_adaptation_field(b: ByteReader) {
  const adaptation_field_length = await b.byte(); // uismbf
  if (adaptation_field_length === 0) return;
  const r = new BitReader(await b.bytes(adaptation_field_length));
  const _start = r.tell();
  const discontinuity_indicator = r.bslbf(1) === 1;
  const random_access_indicator = r.bslbf(1) === 1;
  const elementary_stream_priority_indicator = r.bslbf(1) === 1;
  const PCR_flag = r.bslbf(1);
  const OPCR_flag = r.bslbf(1);
  const splicing_point_flag = r.bslbf(1);
  const transport_private_data_flag = r.bslbf(1);
  const adaptation_field_extension_flag = r.bslbf(1);
  const optional: {
    program_clock_reference_base?: number;
    program_clock_reference_extension?: number;
    original_program_clock_reference_base?: number;
    original_program_clock_reference_extension?: number;
    splice_countdown?: number;
    private_data?: Uint8Array;
    ltw_valid_flag?: boolean;
    ltw_offset?: number;
    piecewise_rate?: number;
    Splice_type?: number;
    DTS_next_AU?: number;
  } = {};
  if (PCR_flag === 1) {
    optional.program_clock_reference_base = r.uimsbf(33);
    reserved_bits(r, 6);
    optional.program_clock_reference_extension = r.uimsbf(9);
  }
  if (OPCR_flag === 1) {
    optional.original_program_clock_reference_base = r.uimsbf(33);
    reserved_bits(r, 6);
    optional.original_program_clock_reference_extension = r.uimsbf(9);
  }
  if (splicing_point_flag === 1) {
    optional.splice_countdown = r.tcimsbf(8);
  }
  if (transport_private_data_flag === 1) {
    const transport_private_data_length = r.uimsbf(8);
    optional.private_data = r.bytes(transport_private_data_length);
  }
  if (adaptation_field_extension_flag === 1) {
    const adaptation_field_extension_length = r.uimsbf(8);
    const _start = r.tell();
    const ltw_flag = r.bslbf(1);
    const piecewise_rate_flag = r.bslbf(1);
    const seamless_splice_flag = r.bslbf(1);
    const af_descriptor_not_present_flag = r.bslbf(1);
    reserved_bits(r, 4);
    if (ltw_flag === 1) {
      optional.ltw_valid_flag = r.bslbf(1) === 1;
      optional.ltw_offset = r.uimsbf(15);
    }
    if (piecewise_rate_flag === 1) {
      reserved_bits(r, 2);
      optional.piecewise_rate = r.uimsbf(22);
    }
    if (seamless_splice_flag === 1) {
      optional.Splice_type = r.bslbf(4);
      optional.DTS_next_AU = r.bslbf(3);
      marker_bit(r);
      optional.DTS_next_AU = optional.DTS_next_AU * Math.pow(2, 15) + r.bslbf(15);
      marker_bit(r);
      optional.DTS_next_AU = optional.DTS_next_AU * Math.pow(2, 15) + r.bslbf(15);
      marker_bit(r);
    }
    if (af_descriptor_not_present_flag === 0) {
      // TODO: parse descriptor
      for (; ;) {
        parse_af_descriptor();
      }
    } else {
      reserved_bits(r, 8 * adaptation_field_extension_length - (r.tell() - _start));
    }
  }
  stuffing_bytes(r, adaptation_field_length - (r.tell() - _start));
  return [adaptation_field_length, {
    discontinuity_indicator,
    random_access_indicator,
    elementary_stream_priority_indicator,
    ...optional,
  }] as const;
}

export class NotSyncByteError extends Error { }

// 2.4.3.2 Transport stream packet layer
export async function parse_transport_packet(b: ByteReader) {
  const _next_byte = await b.byte();
  if (_next_byte !== sync_byte) throw NotSyncByteError;
    const r = new BitReader(await b.bytes(3));
    const transport_error_indicator = r.bslbf(1);
    const payload_unit_start_indicator = r.bslbf(1);
    const transport_priority = r.bslbf(1);
    const PID = r.uimsbf(13);
    const transport_scrambling_control = r.bslbf(2);
    const adaptation_field_control = r.bslbf(2);
    const continuity_counter = r.uimsbf(4);

    const [adaptation_field_length, adaptation_field] = adaptation_field_control === 0b10 || adaptation_field_control === 0b11 ? await parse_adaptation_field(b) ?? [] : [];
    const data_byte = adaptation_field_control === 0b01 || adaptation_field_control === 0b11 ?
      await b.bytes(184 - ((adaptation_field_length ?? -1) + 1))
      : undefined;
  return {
      transport_error_indicator,
      payload_unit_start_indicator,
      transport_priority,
      PID,
      transport_scrambling_control,
      continuity_counter,
      ...(adaptation_field !== undefined ? { adaptation_field } : {}),
      ...(data_byte !== undefined ? { data_byte } : {}),
    };
}

// 2.4.3.1 Transport stream
export async function* parse_transport_stream(b: ByteReader) {
  for (; ;) {
    const bytes = await b.bytes(1);
    if (bytes.length === 0 || bytes[0] !== sync_byte) break;
    yield await parse_transport_packet(b);
  }
}

// 2.4.3.6 PES packet
export async function parse_PES_packet() {
  // TODO
}
