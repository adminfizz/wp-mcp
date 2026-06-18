<?php
/**
 * Plugin Name:       Kim MCP Bridge
 * Plugin URI:        https://github.com/adminfizz/wp-mcp
 * Description:        เปิด REST API ให้ MCP/Telegram bot สั่งงานได้: สร้างบทความ + รูปภาพ + SEO ข้ามหลายโดเมน. Auth ด้วย custom header (X-Kim-Key) เพื่อเลี่ยงปัญหา Authorization header ถูกตัดบน shared hosting.
 * Version:           0.1.0
 * Author:            เลขาคิม (Secretary Kim)
 * License:           GPL-2.0-or-later
 * Text Domain:       kim-mcp-bridge
 *
 * ติดตั้ง: zip โฟลเดอร์นี้ แล้วอัปโหลดผ่าน Plugins > Add New > Upload (cPanel ก็ได้)
 * ตั้งค่า API key: เมนู Settings > Kim MCP  หรือ define('KIM_MCP_KEY','...') ใน wp-config.php
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // ห้ามเรียกตรง
}

define( 'KIM_MCP_VERSION', '0.1.0' );
define( 'KIM_MCP_NS', 'kim/v1' );
define( 'KIM_MCP_OPT_KEY', 'kim_mcp_api_key' );

/* -------------------------------------------------------------------------
 *  AUTH — custom header X-Kim-Key (เลี่ยง Basic Auth ที่ถูกตัดบน cPanel)
 * ---------------------------------------------------------------------- */

/**
 * คืนค่า API key ที่ตั้งไว้ — ลำดับความสำคัญ: wp-config constant > option ใน DB
 */
function kim_mcp_get_key() {
	if ( defined( 'KIM_MCP_KEY' ) && KIM_MCP_KEY ) {
		return (string) KIM_MCP_KEY;
	}
	return (string) get_option( KIM_MCP_OPT_KEY, '' );
}

/**
 * อ่าน key ที่ส่งเข้ามาจาก header (รองรับหลายชื่อ header เผื่อ proxy แปลงชื่อ)
 */
function kim_mcp_request_key( WP_REST_Request $request ) {
	$key = $request->get_header( 'x_kim_key' );          // X-Kim-Key
	if ( ! $key ) {
		$key = $request->get_header( 'x-kim-key' );
	}
	if ( ! $key && isset( $_SERVER['HTTP_X_KIM_KEY'] ) ) {
		$key = $_SERVER['HTTP_X_KIM_KEY'];
	}
	// เผื่อบางเคสส่งมาทาง query (?kim_key=) สำหรับทดสอบเท่านั้น
	if ( ! $key ) {
		$key = $request->get_param( 'kim_key' );
	}
	return is_string( $key ) ? trim( $key ) : '';
}

/**
 * permission_callback — เทียบแบบ constant-time กันการเดา key
 */
function kim_mcp_check_auth( WP_REST_Request $request ) {
	$expected = kim_mcp_get_key();
	if ( '' === $expected ) {
		return new WP_Error(
			'kim_mcp_not_configured',
			'ยังไม่ได้ตั้งค่า API key — ไปที่ Settings > Kim MCP',
			array( 'status' => 503 )
		);
	}
	$given = kim_mcp_request_key( $request );
	if ( '' === $given || ! hash_equals( $expected, $given ) ) {
		return new WP_Error(
			'kim_mcp_unauthorized',
			'API key ไม่ถูกต้องหรือไม่ได้แนบ header X-Kim-Key',
			array( 'status' => 401 )
		);
	}
	return true;
}

/* -------------------------------------------------------------------------
 *  SEO helper — auto-detect RankMath / Yoast แล้วเซ็ต meta ให้ถูกตัว
 * ---------------------------------------------------------------------- */

function kim_mcp_active_seo_plugin() {
	if ( defined( 'RANK_MATH_VERSION' ) || class_exists( 'RankMath' ) ) {
		return 'rankmath';
	}
	if ( defined( 'WPSEO_VERSION' ) || class_exists( 'WPSEO_Options' ) ) {
		return 'yoast';
	}
	return 'none';
}

/**
 * เซ็ต SEO meta ให้โพสต์ — รองรับทั้ง RankMath และ Yoast พร้อมกัน
 *
 * @param int   $post_id
 * @param array $seo  { title, description, focus_keyword, canonical, robots[] }
 */
function kim_mcp_apply_seo( $post_id, array $seo ) {
	$title    = isset( $seo['title'] ) ? sanitize_text_field( $seo['title'] ) : '';
	$desc     = isset( $seo['description'] ) ? sanitize_text_field( $seo['description'] ) : '';
	$focus    = isset( $seo['focus_keyword'] ) ? sanitize_text_field( $seo['focus_keyword'] ) : '';
	$canonical = isset( $seo['canonical'] ) ? esc_url_raw( $seo['canonical'] ) : '';

	$applied = array();

	// RankMath
	if ( $title )     { update_post_meta( $post_id, 'rank_math_title', $title ); $applied['rankmath'] = true; }
	if ( $desc )      { update_post_meta( $post_id, 'rank_math_description', $desc ); }
	if ( $focus )     { update_post_meta( $post_id, 'rank_math_focus_keyword', $focus ); }
	if ( $canonical ) { update_post_meta( $post_id, 'rank_math_canonical_url', $canonical ); }

	// Yoast
	if ( $title )     { update_post_meta( $post_id, '_yoast_wpseo_title', $title ); $applied['yoast'] = true; }
	if ( $desc )      { update_post_meta( $post_id, '_yoast_wpseo_metadesc', $desc ); }
	if ( $focus )     { update_post_meta( $post_id, '_yoast_wpseo_focuskw', $focus ); }
	if ( $canonical ) { update_post_meta( $post_id, '_yoast_wpseo_canonical', $canonical ); }

	return $applied;
}

/* -------------------------------------------------------------------------
 *  MEDIA helper — รับรูปจาก URL หรือ base64 แล้ว sideload เป็น attachment
 * ---------------------------------------------------------------------- */

/**
 * อัปโหลดรูปเข้า media library แล้วคืน attachment_id
 *
 * @param array $img { url | base64, filename, alt }
 * @return int|WP_Error attachment id
 */
function kim_mcp_sideload_image( array $img ) {
	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/media.php';
	require_once ABSPATH . 'wp-admin/includes/image.php';

	$filename = ! empty( $img['filename'] ) ? sanitize_file_name( $img['filename'] ) : 'kim-' . time() . '.png';
	$alt      = isset( $img['alt'] ) ? sanitize_text_field( $img['alt'] ) : '';

	$tmp = wp_tempnam( $filename );
	if ( ! $tmp ) {
		return new WP_Error( 'kim_mcp_tmp_fail', 'สร้างไฟล์ชั่วคราวไม่ได้', array( 'status' => 500 ) );
	}

	if ( ! empty( $img['base64'] ) ) {
		$data = $img['base64'];
		if ( false !== strpos( $data, ',' ) ) {
			$data = substr( $data, strpos( $data, ',' ) + 1 ); // ตัด data:image/png;base64,
		}
		$bytes = base64_decode( $data, true );
		if ( false === $bytes ) {
			@unlink( $tmp );
			return new WP_Error( 'kim_mcp_b64_fail', 'base64 ไม่ถูกต้อง', array( 'status' => 400 ) );
		}
		file_put_contents( $tmp, $bytes );
	} elseif ( ! empty( $img['url'] ) ) {
		$resp = wp_remote_get( esc_url_raw( $img['url'] ), array( 'timeout' => 30 ) );
		if ( is_wp_error( $resp ) || 200 !== wp_remote_retrieve_response_code( $resp ) ) {
			@unlink( $tmp );
			return new WP_Error( 'kim_mcp_dl_fail', 'ดาวน์โหลดรูปจาก URL ไม่สำเร็จ', array( 'status' => 400 ) );
		}
		file_put_contents( $tmp, wp_remote_retrieve_body( $resp ) );
	} else {
		@unlink( $tmp );
		return new WP_Error( 'kim_mcp_no_img', 'ต้องส่ง url หรือ base64', array( 'status' => 400 ) );
	}

	$file_array = array(
		'name'     => $filename,
		'tmp_name' => $tmp,
	);

	$attach_id = media_handle_sideload( $file_array, 0, $alt );
	if ( is_wp_error( $attach_id ) ) {
		@unlink( $tmp );
		return $attach_id;
	}

	if ( $alt ) {
		update_post_meta( $attach_id, '_wp_attachment_image_alt', $alt );
	}

	return $attach_id;
}

/* -------------------------------------------------------------------------
 *  REST ROUTES
 * ---------------------------------------------------------------------- */

add_action( 'rest_api_init', 'kim_mcp_register_routes' );

function kim_mcp_register_routes() {
	$auth = 'kim_mcp_check_auth';

	// health — เช็คว่าปลั๊กอินทำงาน + เวอร์ชัน + SEO plugin
	register_rest_route( KIM_MCP_NS, '/health', array(
		'methods'             => 'GET',
		'permission_callback' => $auth,
		'callback'            => 'kim_mcp_route_health',
	) );

	// list posts/pages
	register_rest_route( KIM_MCP_NS, '/posts', array(
		array(
			'methods'             => 'GET',
			'permission_callback' => $auth,
			'callback'            => 'kim_mcp_route_list_posts',
		),
		array(
			'methods'             => 'POST',
			'permission_callback' => $auth,
			'callback'            => 'kim_mcp_route_create_post',
		),
	) );

	// single post: get / update / delete
	register_rest_route( KIM_MCP_NS, '/posts/(?P<id>\d+)', array(
		array(
			'methods'             => 'GET',
			'permission_callback' => $auth,
			'callback'            => 'kim_mcp_route_get_post',
		),
		array(
			'methods'             => 'POST, PUT, PATCH',
			'permission_callback' => $auth,
			'callback'            => 'kim_mcp_route_update_post',
		),
		array(
			'methods'             => 'DELETE',
			'permission_callback' => $auth,
			'callback'            => 'kim_mcp_route_delete_post',
		),
	) );

	// media upload
	register_rest_route( KIM_MCP_NS, '/media', array(
		'methods'             => 'POST',
		'permission_callback' => $auth,
		'callback'            => 'kim_mcp_route_upload_media',
	) );

	// settings (whitelist เท่านั้น)
	register_rest_route( KIM_MCP_NS, '/settings', array(
		array(
			'methods'             => 'GET',
			'permission_callback' => $auth,
			'callback'            => 'kim_mcp_route_get_settings',
		),
		array(
			'methods'             => 'POST',
			'permission_callback' => $auth,
			'callback'            => 'kim_mcp_route_update_settings',
		),
	) );

	// report — สรุปภาพรวมเว็บ
	register_rest_route( KIM_MCP_NS, '/report', array(
		'methods'             => 'GET',
		'permission_callback' => $auth,
		'callback'            => 'kim_mcp_route_report',
	) );

	// custom action — ขยายได้ผ่าน filter kim_mcp_action_{name}
	register_rest_route( KIM_MCP_NS, '/action/(?P<name>[a-zA-Z0-9_\-]+)', array(
		'methods'             => 'POST',
		'permission_callback' => $auth,
		'callback'            => 'kim_mcp_route_action',
	) );
}

/* ---------- callbacks ---------- */

function kim_mcp_route_health( WP_REST_Request $r ) {
	return rest_ensure_response( array(
		'ok'           => true,
		'plugin'       => 'kim-mcp-bridge',
		'version'      => KIM_MCP_VERSION,
		'wp_version'   => get_bloginfo( 'version' ),
		'php_version'  => PHP_VERSION,
		'site_url'     => get_site_url(),
		'site_name'    => get_bloginfo( 'name' ),
		'seo_plugin'   => kim_mcp_active_seo_plugin(),
		'timezone'     => wp_timezone_string(),
		'server_time'  => current_time( 'mysql' ),
	) );
}

function kim_mcp_route_list_posts( WP_REST_Request $r ) {
	$args = array(
		'post_type'      => $r->get_param( 'type' ) ?: 'post',
		'post_status'    => $r->get_param( 'status' ) ?: 'any',
		'posts_per_page' => (int) ( $r->get_param( 'per_page' ) ?: 20 ),
		'paged'          => (int) ( $r->get_param( 'page' ) ?: 1 ),
		's'              => $r->get_param( 'search' ) ?: '',
		'orderby'        => 'date',
		'order'          => 'DESC',
	);
	$q     = new WP_Query( $args );
	$items = array();
	foreach ( $q->posts as $p ) {
		$items[] = kim_mcp_post_summary( $p );
	}
	return rest_ensure_response( array(
		'total'    => (int) $q->found_posts,
		'page'     => $args['paged'],
		'per_page' => $args['posts_per_page'],
		'items'    => $items,
	) );
}

function kim_mcp_post_summary( $p ) {
	return array(
		'id'        => $p->ID,
		'type'      => $p->post_type,
		'status'    => $p->post_status,
		'title'     => get_the_title( $p ),
		'slug'      => $p->post_name,
		'link'      => get_permalink( $p ),
		'date'      => $p->post_date,
		'modified'  => $p->post_modified,
		'thumbnail' => get_the_post_thumbnail_url( $p, 'medium' ) ?: null,
	);
}

function kim_mcp_route_get_post( WP_REST_Request $r ) {
	$id = (int) $r['id'];
	$p  = get_post( $id );
	if ( ! $p ) {
		return new WP_Error( 'kim_mcp_not_found', 'ไม่พบโพสต์', array( 'status' => 404 ) );
	}
	$data            = kim_mcp_post_summary( $p );
	$data['content'] = $p->post_content;
	$data['excerpt'] = $p->post_excerpt;
	$data['seo']     = array(
		'title'         => get_post_meta( $id, 'rank_math_title', true ) ?: get_post_meta( $id, '_yoast_wpseo_title', true ),
		'description'   => get_post_meta( $id, 'rank_math_description', true ) ?: get_post_meta( $id, '_yoast_wpseo_metadesc', true ),
		'focus_keyword' => get_post_meta( $id, 'rank_math_focus_keyword', true ) ?: get_post_meta( $id, '_yoast_wpseo_focuskw', true ),
	);
	$data['categories'] = wp_get_post_categories( $id, array( 'fields' => 'names' ) );
	$data['tags']       = wp_get_post_tags( $id, array( 'fields' => 'names' ) );
	return rest_ensure_response( $data );
}

/**
 * สร้างโพสต์/เพจ พร้อม SEO + featured image
 * body: { type, title, content, status, slug, excerpt, categories[], tags[],
 *         seo:{title,description,focus_keyword}, featured_image:{url|base64,alt,filename} }
 */
function kim_mcp_route_create_post( WP_REST_Request $r ) {
	$b = $r->get_json_params();
	if ( empty( $b['title'] ) && empty( $b['content'] ) ) {
		return new WP_Error( 'kim_mcp_bad_input', 'ต้องมี title หรือ content', array( 'status' => 400 ) );
	}

	$postarr = array(
		'post_type'    => ! empty( $b['type'] ) ? sanitize_key( $b['type'] ) : 'post',
		'post_title'   => isset( $b['title'] ) ? wp_strip_all_tags( $b['title'] ) : '',
		'post_content' => isset( $b['content'] ) ? wp_kses_post( $b['content'] ) : '',
		'post_excerpt' => isset( $b['excerpt'] ) ? sanitize_textarea_field( $b['excerpt'] ) : '',
		'post_status'  => ! empty( $b['status'] ) ? sanitize_key( $b['status'] ) : 'draft',
	);
	if ( ! empty( $b['slug'] ) ) {
		$postarr['post_name'] = sanitize_title( $b['slug'] );
	}

	$post_id = wp_insert_post( $postarr, true );
	if ( is_wp_error( $post_id ) ) {
		return $post_id;
	}

	$result = kim_mcp_post_apply_taxonomy_seo_image( $post_id, $b );
	$result['id']   = $post_id;
	$result['link'] = get_permalink( $post_id );
	$result['edit'] = get_edit_post_link( $post_id, 'raw' );

	return rest_ensure_response( $result );
}

function kim_mcp_route_update_post( WP_REST_Request $r ) {
	$id = (int) $r['id'];
	if ( ! get_post( $id ) ) {
		return new WP_Error( 'kim_mcp_not_found', 'ไม่พบโพสต์', array( 'status' => 404 ) );
	}
	$b = $r->get_json_params();

	$postarr = array( 'ID' => $id );
	if ( isset( $b['title'] ) )   { $postarr['post_title']   = wp_strip_all_tags( $b['title'] ); }
	if ( isset( $b['content'] ) ) { $postarr['post_content'] = wp_kses_post( $b['content'] ); }
	if ( isset( $b['excerpt'] ) ) { $postarr['post_excerpt'] = sanitize_textarea_field( $b['excerpt'] ); }
	if ( isset( $b['status'] ) )  { $postarr['post_status']  = sanitize_key( $b['status'] ); }
	if ( isset( $b['slug'] ) )    { $postarr['post_name']    = sanitize_title( $b['slug'] ); }

	$res = wp_update_post( $postarr, true );
	if ( is_wp_error( $res ) ) {
		return $res;
	}

	$result = kim_mcp_post_apply_taxonomy_seo_image( $id, $b );
	$result['id']   = $id;
	$result['link'] = get_permalink( $id );
	return rest_ensure_response( $result );
}

/**
 * ใช้ taxonomy / seo / featured image ร่วมกันทั้ง create และ update
 */
function kim_mcp_post_apply_taxonomy_seo_image( $post_id, array $b ) {
	$out = array( 'updated' => true );

	if ( ! empty( $b['categories'] ) && is_array( $b['categories'] ) ) {
		$cat_ids = array();
		foreach ( $b['categories'] as $name ) {
			$term = term_exists( $name, 'category' );
			if ( ! $term ) {
				$term = wp_insert_term( $name, 'category' );
			}
			if ( ! is_wp_error( $term ) ) {
				$cat_ids[] = (int) ( is_array( $term ) ? $term['term_id'] : $term );
			}
		}
		if ( $cat_ids ) {
			wp_set_post_categories( $post_id, $cat_ids );
		}
	}

	if ( ! empty( $b['tags'] ) && is_array( $b['tags'] ) ) {
		wp_set_post_tags( $post_id, $b['tags'], false );
	}

	if ( ! empty( $b['seo'] ) && is_array( $b['seo'] ) ) {
		$out['seo_applied'] = kim_mcp_apply_seo( $post_id, $b['seo'] );
	}

	if ( ! empty( $b['featured_image'] ) && is_array( $b['featured_image'] ) ) {
		$att = kim_mcp_sideload_image( $b['featured_image'] );
		if ( is_wp_error( $att ) ) {
			$out['featured_image_error'] = $att->get_error_message();
		} else {
			set_post_thumbnail( $post_id, $att );
			$out['featured_image_id']  = $att;
			$out['featured_image_url'] = wp_get_attachment_url( $att );
		}
	}

	return $out;
}

function kim_mcp_route_delete_post( WP_REST_Request $r ) {
	$id    = (int) $r['id'];
	$force = (bool) $r->get_param( 'force' );
	if ( ! get_post( $id ) ) {
		return new WP_Error( 'kim_mcp_not_found', 'ไม่พบโพสต์', array( 'status' => 404 ) );
	}
	$res = wp_delete_post( $id, $force );
	if ( ! $res ) {
		return new WP_Error( 'kim_mcp_delete_fail', 'ลบไม่สำเร็จ', array( 'status' => 500 ) );
	}
	return rest_ensure_response( array( 'deleted' => true, 'id' => $id, 'forced' => $force ) );
}

function kim_mcp_route_upload_media( WP_REST_Request $r ) {
	$b   = $r->get_json_params();
	$att = kim_mcp_sideload_image( is_array( $b ) ? $b : array() );
	if ( is_wp_error( $att ) ) {
		return $att;
	}
	return rest_ensure_response( array(
		'id'         => $att,
		'source_url' => wp_get_attachment_url( $att ),
		'alt'        => get_post_meta( $att, '_wp_attachment_image_alt', true ),
	) );
}

/**
 * settings — อ่าน/เขียน option ได้เฉพาะ key ที่ whitelist ผ่าน filter
 * เพิ่ม key ที่อนุญาตได้ด้วย: add_filter('kim_mcp_allowed_options', fn($k)=>[...$k,'my_opt']);
 */
function kim_mcp_allowed_options() {
	$default = array( 'blogname', 'blogdescription', 'kim_mcp_demo' );
	return apply_filters( 'kim_mcp_allowed_options', $default );
}

function kim_mcp_route_get_settings( WP_REST_Request $r ) {
	$allowed = kim_mcp_allowed_options();
	$keys    = $r->get_param( 'keys' );
	$keys    = $keys ? array_map( 'trim', explode( ',', $keys ) ) : $allowed;
	$out     = array();
	foreach ( $keys as $k ) {
		if ( in_array( $k, $allowed, true ) ) {
			$out[ $k ] = get_option( $k );
		}
	}
	return rest_ensure_response( array( 'allowed' => $allowed, 'values' => $out ) );
}

function kim_mcp_route_update_settings( WP_REST_Request $r ) {
	$allowed = kim_mcp_allowed_options();
	$b       = $r->get_json_params();
	$updated = array();
	$skipped = array();
	foreach ( (array) $b as $k => $v ) {
		if ( in_array( $k, $allowed, true ) ) {
			update_option( $k, $v );
			$updated[ $k ] = $v;
		} else {
			$skipped[] = $k;
		}
	}
	return rest_ensure_response( array( 'updated' => $updated, 'skipped' => $skipped ) );
}

function kim_mcp_route_report( WP_REST_Request $r ) {
	$counts = wp_count_posts( 'post' );
	$pages  = wp_count_posts( 'page' );
	$recent = array();
	foreach ( get_posts( array( 'numberposts' => 5, 'post_status' => 'any' ) ) as $p ) {
		$recent[] = kim_mcp_post_summary( $p );
	}
	return rest_ensure_response( array(
		'site'    => get_bloginfo( 'name' ),
		'url'     => get_site_url(),
		'posts'   => array(
			'publish' => (int) $counts->publish,
			'draft'   => (int) $counts->draft,
			'pending' => (int) $counts->pending,
		),
		'pages'   => array( 'publish' => (int) $pages->publish ),
		'comments' => wp_count_comments()->approved,
		'theme'   => wp_get_theme()->get( 'Name' ),
		'seo_plugin' => kim_mcp_active_seo_plugin(),
		'recent'  => $recent,
	) );
}

function kim_mcp_route_action( WP_REST_Request $r ) {
	$name    = sanitize_key( $r['name'] );
	$payload = $r->get_json_params();
	$hook    = "kim_mcp_action_{$name}";

	if ( ! has_filter( $hook ) ) {
		return new WP_Error(
			'kim_mcp_unknown_action',
			"ไม่มี action '{$name}' — ลงทะเบียนด้วย add_filter('{$hook}', ...)",
			array( 'status' => 404 )
		);
	}
	$result = apply_filters( $hook, null, $payload, $r );
	return rest_ensure_response( array( 'action' => $name, 'result' => $result ) );
}

/* -------------------------------------------------------------------------
 *  ADMIN — หน้าตั้งค่า API key
 * ---------------------------------------------------------------------- */

add_action( 'admin_menu', function () {
	add_options_page( 'Kim MCP', 'Kim MCP', 'manage_options', 'kim-mcp', 'kim_mcp_settings_page' );
} );

add_action( 'admin_init', function () {
	register_setting( 'kim_mcp_group', KIM_MCP_OPT_KEY );
} );

function kim_mcp_settings_page() {
	$key       = get_option( KIM_MCP_OPT_KEY, '' );
	$const_set = defined( 'KIM_MCP_KEY' ) && KIM_MCP_KEY;
	?>
	<div class="wrap">
		<h1>Kim MCP Bridge</h1>
		<p>REST namespace: <code><?php echo esc_html( KIM_MCP_NS ); ?></code> —
			ทดสอบ: <code><?php echo esc_html( get_site_url() . '/wp-json/' . KIM_MCP_NS . '/health' ); ?></code></p>
		<p>SEO plugin ที่ตรวจพบ: <strong><?php echo esc_html( kim_mcp_active_seo_plugin() ); ?></strong></p>
		<?php if ( $const_set ) : ?>
			<div class="notice notice-info"><p>API key ถูกกำหนดผ่าน <code>KIM_MCP_KEY</code> ใน wp-config.php (ค่านี้จะถูกใช้แทนค่าด้านล่าง)</p></div>
		<?php endif; ?>
		<form method="post" action="options.php">
			<?php settings_fields( 'kim_mcp_group' ); ?>
			<table class="form-table">
				<tr>
					<th scope="row">API Key (X-Kim-Key)</th>
					<td>
						<input type="text" name="<?php echo esc_attr( KIM_MCP_OPT_KEY ); ?>"
							value="<?php echo esc_attr( $key ); ?>" class="regular-text" style="width:420px" />
						<p class="description">ตั้งให้ยาว สุ่ม และเก็บเป็นความลับ — ใช้ค่าเดียวกันฝั่ง MCP/บอท</p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}
