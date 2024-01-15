// 2.4.3 Specification of the transport stream syntax and semantics

import { BitReader, ByteReader } from '../../reader.js';
import { parse_af_descriptor } from './af_descriptor.js';

const sync_byte = 0x47;

export class MalformedDataError extends Error { }
export class UnimplementedReserveError extends Error { }

function marker_bit(r: BitReader) {
  if (r.bslbf(1) !== 1) throw new MalformedDataError('Expected marker bit to be 1');
}

// 2.1.131 reserved
function reserved_bits(r: BitReader, n: number) {
  for (let i = 0; i < n; i++) {
    if (r.bslbf(1) !== 1) throw new UnimplementedReserveError('Expected reserve bits to be 1');
  }
}

function stuffing_bytes(r: BitReader, n: number) {
  const bytes = r.bytes(n);
  for (let i = 0; i < n; i++) {
    if (bytes[i] !== 0xff) throw new MalformedDataError('Expected stuffing byte to be 0xff');
  }
}

function padding_bytes(r: BitReader, n: number) {
  const bytes = r.bytes(n);
  for (let i = 0; i < n; i++) {
    if (bytes[i] !== 0xff) throw new MalformedDataError('Expected padding byte to be 0xff');
  }
}

function check_constant(r: BitReader, n: number, value: number) {
  const _value = r.bslbf(n);
  if (_value !== value) throw new MalformedDataError(`Expected ${value} but got ${_value}`);
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
export async function parse_PES_packet(b: ByteReader) {
  let r = new BitReader(await b.bytes(6));
  const packet_start_code_prefix = r.uimsbf(24);
  const stream_id = r.uimsbf(8);
  const PES_packet_length = r.uimsbf(16);
  r = new BitReader(await b.bytes(PES_packet_length));
  const optional: {
    PES_scrambling_control?: number;
    PES_priority?: boolean;
    data_alignment_indicator?: boolean;
    copyright?: boolean;
    original_or_copy?: boolean;
    PTS?: number;
    DTS?: number;
    ESCR_base?: number;
    ESCR_extension?: number;
    ES_rate?: number;
    trick_mode_control?: TrickModeControl;
    field_id?: number;
    intra_slice_refresh?: boolean;
    frequency_truncation?: number;
    rep_cntrl?: number;
    additional_copy_info?: number;
    previous_PES_packet_CRC?: number;
    PES_private_data?: Uint8Array;
    program_packet_sequence_counter?: number;
    MPEG1_MPEG2_identifier?: number;
    original_stuff_length?: number;
    'P-STD_buffer_scale'?: number;
    'P-STD_buffer_size'?: number;
    stream_id_extension?: number;
    TREF?: number;
    PES_packet_data?: Uint8Array;
  } = {};
  if (
    stream_id === StreamID.program_stream_map
    || stream_id === StreamID.private_stream_2
    || stream_id === StreamID.ECM_stream
    || stream_id === StreamID.EMM_stream
    || stream_id === StreamID.program_stream_directory
    || stream_id === StreamID.DSMCC_stream
    || stream_id === StreamID.Rec_ITU_T_H_222_1_type_E
  ) {
    optional.PES_packet_data = r.bytes(PES_packet_length);
  } else if (stream_id === StreamID.padding_stream) {
    padding_bytes(r, PES_packet_length);
  } else {
    check_constant(r, 2, 0b10);
    optional.PES_scrambling_control = r.bslbf(2);
    optional.PES_priority = r.bslbf(1) === 1;
    optional.data_alignment_indicator = r.bslbf(1) === 1;
    optional.copyright = r.bslbf(1) === 1;
    optional.original_or_copy = r.bslbf(1) === 1;
    const PTS_DTS_flags = r.bslbf(2);
    const ESCR_flag = r.bslbf(1);
    const ES_rate_flag = r.bslbf(1);
    const DSM_trick_mode_flag = r.bslbf(1);
    const additional_copy_info_flag = r.bslbf(1);
    const PES_CRC_flag = r.bslbf(1);
    const PES_extension_flag = r.bslbf(1);
    // byte aligned starting from here
    const PES_header_data_length = r.uimsbf(8);
    const _start = r.tell();
    if (PTS_DTS_flags === 0b10 || PTS_DTS_flags === 0b11) {
      check_constant(r, 2, 0b00);
      check_constant(r, 2, PTS_DTS_flags);
      optional.PTS = r.bslbf(3);
      marker_bit(r);
      optional.PTS = optional.PTS * Math.pow(2, 15) + r.bslbf(15);
      marker_bit(r);
      optional.PTS = optional.PTS * Math.pow(2, 15) + r.bslbf(15);
      marker_bit(r);
    }
    if (PTS_DTS_flags === 0b11) {
      check_constant(r, 4, 0b0001);
      optional.DTS = r.bslbf(3);
      marker_bit(r);
      optional.DTS = optional.DTS * Math.pow(2, 15) + r.bslbf(15);
      marker_bit(r);
      optional.DTS = optional.DTS * Math.pow(2, 15) + r.bslbf(15);
      marker_bit(r);
    }
    if (ESCR_flag === 1) {
      reserved_bits(r, 2);
      optional.ESCR_base = r.bslbf(3);
      marker_bit(r);
      optional.ESCR_base = optional.ESCR_base * Math.pow(2, 15) + r.bslbf(15);
      marker_bit(r);
      optional.ESCR_base = optional.ESCR_base * Math.pow(2, 15) + r.bslbf(15);
      marker_bit(r);
      optional.ESCR_extension = r.bslbf(9);
      marker_bit(r);
    }
    if (ES_rate_flag === 1) {
      marker_bit(r);
      optional.ES_rate = r.bslbf(22);
      marker_bit(r);
    }
    if (DSM_trick_mode_flag === 1) {
      optional.trick_mode_control = r.bslbf(3);
      switch (optional.trick_mode_control) {
        case TrickModeControl.FastForward:
        case TrickModeControl.FastReverse:
          optional.field_id = r.bslbf(2);
          optional.intra_slice_refresh = r.bslbf(1) === 1;
          optional.frequency_truncation = r.bslbf(2);
          break;
        case TrickModeControl.SlowMotion:
        case TrickModeControl.SlowReverse:
          optional.rep_cntrl = r.bslbf(5);
          break;
        case TrickModeControl.FreezeFrame:
          optional.field_id = r.bslbf(2);
          reserved_bits(r, 3);
          break;
        default:
          throw new UnimplementedReserveError(`Trick mode control ${optional.trick_mode_control} is reserved`);
      }
    }
    if (additional_copy_info_flag === 1) {
      marker_bit(r);
      optional.additional_copy_info = r.bslbf(7);
    }
    if (PES_CRC_flag === 1) {
      marker_bit(r);
      optional.previous_PES_packet_CRC = r.bslbf(16);
    }
    if (PES_extension_flag === 1) {
      const PES_private_data_flag = r.bslbf(1);
      const pack_header_field_flag = r.bslbf(1);
      const program_packet_sequence_counter_flag = r.bslbf(1);
      const P_STD_buffer_flag = r.bslbf(1);
      reserved_bits(r, 3);
      const PES_extension_flag_2 = r.bslbf(1);
      if (PES_private_data_flag === 1) {
        optional.PES_private_data = r.bytes(128 / 8);
      }
      if (pack_header_field_flag === 1) {
        const pack_field_length = r.uimsbf(8);
        parse_pack_header();
      }
      if (program_packet_sequence_counter_flag === 1) {
        marker_bit(r);
        optional.program_packet_sequence_counter = r.uimsbf(7);
        marker_bit(r);
        optional.MPEG1_MPEG2_identifier = r.bslbf(1);
        optional.original_stuff_length = r.uimsbf(6);
      }
      if (P_STD_buffer_flag === 1) {
        check_constant(r, 2, 0b01);
        optional['P-STD_buffer_scale'] = r.bslbf(1);
        optional['P-STD_buffer_size'] = r.bslbf(13);
      }
      if (PES_extension_flag_2 === 1) {
        marker_bit(r);
        const PES_extension_field_length = r.uimsbf(7);
        const _start = r.tell();
        const stream_id_extension_flag = r.bslbf(1);
        if (stream_id_extension_flag === 0) {
          optional.stream_id_extension = r.uimsbf(7);
        } else {
          reserved_bits(r, 6);
          const tref_extension_flag = r.bslbf(1);
          if (tref_extension_flag === 0) {
            reserved_bits(r, 4);
            optional.TREF = r.bslbf(3);
            marker_bit(r);
            optional.TREF = optional.TREF * Math.pow(2, 15) + r.bslbf(15);
            marker_bit(r);
            optional.TREF = optional.TREF * Math.pow(2, 15) + r.bslbf(15);
            marker_bit(r);
          }
        }
        reserved_bits(r, 8 * PES_extension_field_length - (r.tell() - _start));
      }
    }
    const N1 = PES_header_data_length - ((r.tell() - _start) >>> 3);
    if (N1 > 32) {
      throw new MalformedDataError(`No more than 32 stuffing bytes shall be present in one PES packet header.`);
    }
    stuffing_bytes(r, N1);
    optional.PES_packet_data = r.bytes(PES_packet_length - (r.tell() >>> 3));
  }
  return {
    packet_start_code_prefix,
    stream_id,
    ...optional,
  };
}

// Table 2-22 Stream_id assignments
export const enum StreamID {
  program_stream_map = 0b1011_1100,
  private_stream_1 = 0b1011_1101,
  padding_stream = 0b1011_1110,
  private_stream_2 = 0b1011_1111,
  // 110x_xxxx: ISO/IEC 13818-3 or ISO/IEC 11172-3 or ISO/IEC 13818-7 or ISO/IEC 14496-3 or ISO/IEC 23008-3 audio stream number 'x xxxx'
  // 1110_xxxx: Rec. ITU-T H.262 | ISO/IEC 13818-2, ISO/IEC 11172-2, ISO/IEC 14496-2, Rec. ITU-T H.264 | ISO/IEC 14496-10, Rec. ITU-T H.265 | ISO/IEC 23008-2, Rec. ITU-T H.266 | ISO/IEC 23090-3, ISO/IEC 23094-1 or ISO/IEC 23094-2 video stream number xxxx
  ECM_stream = 0b1111_0000,
  EMM_stream = 0b1111_0001,
  DSMCC_stream = 0b1111_0010, // Rec. ITU-T H.222.0 | ISO/IEC 13818-1 Annex A or ISO/IEC 13818-6_DSMCC_stream
  ISO_IEC_13522_stream = 0b1111_0011,
  Rec_ITU_T_H_222_1_type_A = 0b1111_0100,
  Rec_ITU_T_H_222_1_type_B = 0b1111_0101,
  Rec_ITU_T_H_222_1_type_C = 0b1111_0110,
  Rec_ITU_T_H_222_1_type_D = 0b1111_0111,
  Rec_ITU_T_H_222_1_type_E = 0b1111_1000,
  ancillary_stream = 0b1111_1001,
  ISO_IEC_14496_1_SL_packetized_stream = 0b1111_1010,
  ISO_IEC_14496_1_M4Mux_stream = 0b1111_1011,
  metadata_stream = 0b1111_1100,
  extended_stream_id = 0b1111_1101,
  // 1111_1110: Reserved
  program_stream_directory = 0b1111_1111,
}

// Table 2-24 Trick mode control values
export const enum TrickModeControl {
  FastForward = 0b000,
  SlowMotion = 0b001,
  FreezeFrame = 0b010,
  FastReverse = 0b011,
  SlowReverse = 0b100,
  // 101-111: Reserved
}

export function parse_pack_header() {
  // TODO
}
