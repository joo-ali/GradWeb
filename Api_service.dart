import 'dart:convert';
import 'dart:developer';
import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide MultipartFile;
import 'package:wedding_app/models/user_model.dart';
import 'package:shared_preferences/shared_preferences.dart';
//https://licenses-car-inherited-termination.trycloudflare.com
const domain = 'https://575afd9e37f2.ngrok-free.app';

class ApiService {
  final Dio dio;
  ApiService(this.dio);

  Future<List<UserModel>> getUsers() async {
    
    //String url = "http://localhost:1337/api/users?populate=*";
    String url = "$domain/api/users?populate=*";
    try {
      final response = await dio.get(url);
      log("URL CALLED: $url");
      log("RAW RESPONSE: ${response.data}");

      // هنا لأن Strapi بيرجع ليست من اليوزرز
      List<dynamic> usersData = response.data as List;
      List<UserModel> usersList = usersData
          .map((user) => UserModel.fromJson(user))
          .toList();

      return usersList;
    } catch (e) {
      log("Error fetching users: $e");
      return [];
    }
  }

  Future<UserModel?> signUpUser({
    required String username,
    required String email,
    required String password,
    required num instaPayNumber,
    required String address,
  }) async {
    const String url =
        //"http://localhost:1337/api/auth/local/register"; // استخدم IP مناسب بدل localhost لو شغال من emulator
        "$domain/api/auth/local/register";
    try {
      // الخطوة 1️⃣: تسجيل المستخدم الأساسي
      final response = await dio.post(
        url,
        data: {"username": username, "email": email, "password": password},
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final token = response.data['jwt'];
        final userJson = response.data['user'];
        final userId = userJson['id'];

        // الخطوة 2️⃣: تحديث بيانات المستخدم المخصصة (instaPayNumber و address)

        //final updateUrl = "http://localhost:1337/api/users/$userId";
        final updateUrl =
            "$domain/api/users/$userId";


        await dio.put(
          updateUrl,
          data: {"instaPayNumber": instaPayNumber, "address": address},
          options: Options(headers: {"Authorization": "Bearer $token"}),
        );

        // الخطوة 3️⃣: رجّع بيانات اليوزر
        return UserModel.fromJson(userJson);
      } else {
        print("Signup failed with status code: ${response.statusCode}");
        return null;
      }
    } catch (e) {
      if (e is DioError) {
        print("Signup error: ${e.response?.data}");
      } else {
        print("Signup error: $e");
      }
      return null;
    }
  }

  Future<UserModel?> signInUser({
    required String identifier,
    required String password,
  }) async {
    //const String url = "http://localhost:1337/api/auth/local";
    const String url =
        "$domain/api/auth/local";

    try {
      final response = await dio.post(
        url,
        data: {
          "identifier": identifier, // ممكن يكون username أو email
          "password": password,
        },
      );
      log("🔹 Login response: ${response.data}");
      final userJson = response.data['user'];
      final token = response.data['jwt'];

      if (userJson == null || token == null) {
        log("⚠️ Missing user or token data!");
        return null;
      }
      // ✅ خزّن التوكن في الـ UserModel نفسه
      final user = UserModel.fromJson(userJson);
      user.jwt = token; // <— أضفها هنا

      // ✅ خزن كمان التوكن محليًا (احتياطي)
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString("token", token);
      await prefs.setInt("userId", user.id);

      return user;

      // final token = response.data['jwt'];

      // // احفظ الـ token عندك محليًا لو محتاجه بعدين
      // print("JWT Token: $token");

      // return UserModel.fromJson(userJson);
    } catch (e) {
      if (e is DioError) {
        log("❌ Login error: ${e.response?.data}");
        log(e.response?.data);
        print(e.message);

      } else {
        log("❌ Login error: $e");
      }
      // print("Login error: $e");
      return null;
    }
  }


  Future<String?> uploadWishlistItemImage({
  required int userId,
  required String wishlistItemTitle,
  required Uint8List bytes,
  required String fileName,
}) async {
  final supabase = Supabase.instance.client;

  String generateSafeFileName(String originalName) {
  final extension = originalName.split('.').last;
  return 'img_${DateTime.now().millisecondsSinceEpoch}.$extension';
}


 final safeTitle = wishlistItemTitle.replaceAll(" ", "_");
 final safefileName=generateSafeFileName(fileName);


  final path = "users/$userId/whishList/$safeTitle/itemImages/$safefileName";

  final res = await supabase.storage
      .from("user-uploads")
      .uploadBinary(path, bytes, fileOptions: const FileOptions(upsert: true));

  if (res == null) return null;

  final PublicUrl = await supabase.storage
      .from("user-uploads")
      .getPublicUrl(path); 

  return PublicUrl;
}

// Future<void> updateWishlistItemImage({
//   required int userId,
//   required String token,
//   required String wishlistItemTitle,
//   required String imageUrl,
// }) async {
//   try {
//     log("🔄 Updating wishlist item image...");

//     // 1️⃣ نجيب الداتا الحالية
//     final userResponse = await dio.get(
//       "http://localhost:1337/api/users/$userId",
//       options: Options(headers: {"Authorization": "Bearer $token"}),
//     );

//     List<dynamic> wishlist = [];

//     if (userResponse.data['wishlist'] != null) {
//       if (userResponse.data['wishlist'] is String) {
//         wishlist = json.decode(userResponse.data['wishlist']);
//       } else {
//         wishlist = userResponse.data['wishlist'];
//       }
//     }

//     // 2️⃣ نعدل العنصر المطلوب
//     for (var item in wishlist) {
//       if (item['title'] == wishlistItemTitle) {
//         item['image'] = imageUrl; // ← نحط لينك الصورة الجديد
//       }
//     }

//     // 3️⃣ نعمل UPDATE واحد فقط
//     await dio.put(
//       "http://localhost:1337/api/users/$userId",
//       data: {"wishlist": wishlist},
//       options: Options(
//         headers: {
//           "Authorization": "Bearer $token",
//           "Content-Type": "application/json",
//         },
//       ),
//     );

//     log("✅ Wishlist image updated!");
//   } catch (e) {
//     log("❌ Error updating image: $e");
//     rethrow;
//   }
// }
Future<String?> uploadWishlistItemBill({
  required int userId,
  required String wishlistItemTitle,
  required Uint8List bytes,
  required String fileName,
}) async {
  final supabase = Supabase.instance.client;

  final safeTitle = wishlistItemTitle.replaceAll(" ", "_");


  final path = "users/$userId/whishList/$safeTitle/itemBills/$fileName";

  final res = await supabase.storage
      .from("user-uploads")
      .uploadBinary(path, bytes, fileOptions: const FileOptions(upsert: true));

  if (res == null) return null;

  // Signed URL (يشتغل)
  final PublicUrl = await supabase.storage
      .from("user-uploads")
      .getPublicUrl(path);
  return PublicUrl;
}

Future<void> addDonation({
  required int userId,
  String? token,
  required String itemTitle,
  required String donorName,
  required int amount,
  required String billUrl,
}) async {
  try {
    log("🔄 Adding donation inside wishlist...");

    // 1️⃣ جبنا بيانات اليوزر
    final userResponse = await dio.get(
      "$domain/api/users/$userId",
      options: Options(headers: {"Authorization": "Bearer $token"}),
    );

    // 2️⃣ قراءة الـ wishlist
    List<dynamic> wishlist = [];

    if (userResponse.data["wishlist"] != null) {
      if (userResponse.data["wishlist"] is String) {
        wishlist = json.decode(userResponse.data["wishlist"]);
      } else if (userResponse.data["wishlist"] is List) {
        wishlist = userResponse.data["wishlist"];
      }
    }

    // لو مفيش wishlist أصلاً
    if (wishlist.isEmpty) {
      throw Exception("Wishlist is empty. Cannot add donation.");
    }

    // 3️⃣ نجيب الـ item المطلوب
    final index = wishlist.indexWhere(
      (item) => item["title"].toString().trim() == itemTitle.trim(),
    );

    if (index == -1) {
      throw Exception("Item not found in wishlist.");
    }

    // عنصر ال wish
    Map<String, dynamic> item = wishlist[index];

    // 4️⃣ تأكد إن donors موجود
    List<dynamic> donors = [];

    if (item["donors"] != null) {
      if (item["donors"] is String) {
        donors = json.decode(item["donors"]);
      } else if (item["donors"] is List) {
        donors = item["donors"];
      }
    }

    // 5️⃣ نضيف donor جديد
    Map<String, dynamic> newDonor = {
      "name": donorName,
      "amount": amount,
      "bill": billUrl,
    };

    donors.add(newDonor);

    // 6️⃣ حساب donated الجديد
    int donatedSum = 0;
    for (var d in donors) {
      donatedSum += (d["amount"] as int);
    }

    // 7️⃣ تحديث العنصر نفسه
    item["donors"] = donors;
    item["donated"] = donatedSum;

    // 8️⃣ نحدث wishlist كلها
    wishlist[index] = item;

    Map<String, dynamic> updateData = {
      "wishlist": wishlist,
    };

    log("📤 Sending updated wishlist: $updateData");

    // 9️⃣ نعمل PUT
    final updateResponse = await dio.put(
      "$domain/api/users/$userId",
      data: updateData,
      options: Options(
        headers: {
          "Authorization": "Bearer $token",
          "Content-Type": "application/json",
        },
      ),
    );

    if (updateResponse.statusCode == 200) {
      log("✅ Donation added successfully!");

      final verifyResponse = await dio.get(
        "$domain/api/users/$userId",
        options: Options(headers: {"Authorization": "Bearer $token"}),
      );
      log("🔍 Updated wishlist: ${verifyResponse.data['wishlist']}");
    } else {
      throw Exception("Failed to update user: ${updateResponse.statusCode}");
    }
  } catch (e) {
    log("❌ Error: $e");
    rethrow;
  }
}



  // دالة إضافة العنصر للـ wishlist كـ JSON field
  Future<void> addWishlistItem({
    required int userId,
    required String token,
    required String title,
    required double price,
    required String url,
    required String imageUrl,
    //required Uint8List? imageBytes,
  }) async {
    try {
      log("🔄 Adding wishlist item to JSON field...");

      // 1️⃣ أولاً: نجيب البيانات الحالية
      final userResponse = await dio.get(
        "$domain/api/users/$userId",
        //"http://localhost:1337/api/users/$userId",
        options: Options(headers: {"Authorization": "Bearer $token"}),
      );

      // 2️⃣ نستخرج الـ wishlist الحالية أو ننشئ مصفوفة جديدة
      List<dynamic> currentWishlist = [];

      if (userResponse.data['wishlist'] != null) {
        if (userResponse.data['wishlist'] is String) {
          // إذا كانت JSON string, نحولها لـ List
          currentWishlist = json.decode(userResponse.data['wishlist']);
        } else if (userResponse.data['wishlist'] is List) {
          // إذا كانت List مباشرة
          currentWishlist = userResponse.data['wishlist'];
        }
      }

      log("📋 Current wishlist items: ${currentWishlist.length}");

      // 3️⃣ نبني العنصر الجديد
      Map<String, dynamic> newItem = {
        "id": DateTime.now().millisecondsSinceEpoch, // ID فريد
        "title": title.trim(),
        "price": price,
        "url": url.trim().isEmpty ? "https://example.com" : url.trim(),
        "image": imageUrl,
        "createdAt": DateTime.now().toIso8601String(),
      };

      // 4️⃣ نضيف العنصر الجديد
      currentWishlist.add(newItem);

      // 5️⃣ نجهز البيانات للإرسال
      Map<String, dynamic> updateData = {
        "wishlist": currentWishlist, // نرسلها كـ List مباشرة
      };

      log("📤 Sending update data: $updateData");

      // 6️⃣ نرسل الطلب
      final updateResponse = await dio.put(
        //"http://localhost:1337/api/users/$userId",
        "$domain/api/users/$userId",
        data: updateData,
        options: Options(
          headers: {
            "Authorization": "Bearer $token",
            "Content-Type": "application/json",
          },
        ),
      );

      if (updateResponse.statusCode == 200) {
        log("✅ Wishlist item added successfully!");

        // تحقق من البيانات المحدثة

        final verifyResponse = await dio.get(
          //"http://localhost:1337/api/users/$userId",
          "$domain/api/users/$userId",
          options: Options(headers: {"Authorization": "Bearer $token"}),
        );

        log("🔍 Updated wishlist: ${verifyResponse.data['wishlist']}");
      } else {
        log("❌ Failed with status: ${updateResponse.statusCode}");
        throw Exception(
          "Failed to add wishlist item: ${updateResponse.statusCode}",
        );
      }
    } on DioException catch (e) {
      log("❌ Dio Error: ${e.message}");
      log("❌ Response: ${e.response?.data}");
      rethrow;
    } catch (e) {
      log("❌ Unexpected error: $e");
      rethrow;
    }
  }



  Future<List<UserModel>> searchUsers(String query) async {
  final response = await dio.get(
    "$domain/api/search-users",
    queryParameters: {
      "q": query,
    },
  );

  List data = response.data;
  return data.map((user) => UserModel.fromJson(user)).toList();
}

Future<UserModel> getPublicUserById(String userId) async {
  final response = await dio.get(
    "$domain/api/users/$userId?populate=*",
  );

  final data = response.data;

  if (data is Map && data.containsKey("data")) {
    return UserModel.fromJson(data["data"]);
  }

  return UserModel.fromJson(data);
}





  Future<UserModel> getUserData() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString("token");
    final userId = prefs.getInt("userId");

    if (token == null || userId == null) {
      throw Exception("User not logged in");
    }

    final response = await dio.get(
      //"http://localhost:1337/api/users/$userId?populate=*",
      "$domain/api/users/$userId?populate=*",

      options: Options(headers: {"Authorization": "Bearer $token"}),
    );

    // في Strapi v5 الـ data نفسها ممكن تكون جوا "data" أو فوق
    final data = response.data;

    // لو الاستجابة فيها data:data[]
    if (data is Map && data.containsKey("data")) {
      return UserModel.fromJson(data["data"]);
    }

    // لو الاستجابة مباشرة بدون لفة زي عندك
    log("🔹 User data fetched: $data");
    return UserModel.fromJson(data);
  }

  // Future<void> addWishlistItem({
  //   required int userId,
  //   required String token,
  //   required String title,
  //   required double price,
  //   required String imageUrl,
  //   required String url,
  // }) async {
  //   try {
  //     // 1️⃣ نحضر الـ wishlist القديمة
  //     final getResponse = await dio.get(
  //       "http://localhost:1337/api/users/$userId?populate=wishlist",
  //       options: Options(headers: {
  //         "Authorization": "Bearer $token",
  //       }),
  //     );

  //     List<dynamic> oldWishlist = getResponse.data['wishlist'] ?? [];

  //     // 2️⃣ نضيف العنصر الجديد
  //     oldWishlist.add({
  //       "title": title,
  //       "price": price,
  //       "image": imageUrl,
  //       "url": url,
  //     });

  //     // 3️⃣ نرفع الـ wishlist الجديدة كاملة
  //     await dio.put(
  //       "http://localhost:1337/api/users/$userId",
  //       data: {"wishlist": oldWishlist},
  //       options: Options(headers: {
  //         "Authorization": "Bearer $token",
  //       }),
  //     );

  //     print("✅ Wishlist item added successfully");
  //   } catch (e) {
  //     print("❌ Error adding wishlist item: $e");
  //   }
  // }


 

  



Future<bool> uploadAndUpdateWishlistItemBill({
  required int itemId,
  required String wishlistItemTitle,
}) async {
  try {
    final picker = ImagePicker();
    final pickedFile = await picker.pickImage(source: ImageSource.gallery);
    if (pickedFile == null) return false;

    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    final userId = prefs.getInt('userId');
    if (token == null || userId == null) return false;

    final safeTitle = wishlistItemTitle.replaceAll(" ", "_");

    final bytes = await pickedFile.readAsBytes();

    // 1️⃣ Upload to Supabase
    final billUrl = await uploadWishlistItemBill(
      userId: userId,
      wishlistItemTitle: safeTitle,
      bytes: bytes,
      fileName: pickedFile.name,
    );

    if (billUrl == null) return false;

    // 2️⃣ Update Strapi
    final updateRes = await dio.put(
      //"http://localhost:1337/api/wishlist-items/$itemId",
      "$domain/api/wishlist-items/$itemId",
      data: {
        "billImageUrl": billUrl,
      },
      options: Options(
        headers: {"Authorization": "Bearer $token"},
        contentType: "application/json",
      ),
    );

    return updateRes.statusCode == 200 || updateRes.statusCode == 201;
  } catch (e) {
    print("❌ uploadAndUpdateWishlistItemBill error: $e");
    return false;
  }
}

 

 Future<String?> uploadProfileImages(int userId, Uint8List bytes, String fileName) async {
  final supabase = Supabase.instance.client;

  final path = "users/$userId/profileImages/$fileName";

  final res = await supabase.storage
      .from("user-uploads")
      .uploadBinary(path, bytes, fileOptions: const FileOptions(upsert: true));

  if (res == null) return null;

  final publicUrl = await supabase.storage.from("user-uploads").getPublicUrl(path); 
  //final publicUrl ="https://cprjyoteonirclrakvio.supabase.co/storage/v1/object/public/user-uploads/$path";
  log("✅ Image uploaded to Supabase Storage: $publicUrl");

  return publicUrl;
}



  Future<bool> uploadAndUpdateProfileImage(UserModel user) async {
    try {
    final picker = ImagePicker();
    final pickedFile = await picker.pickImage(source: ImageSource.gallery);
    if (pickedFile == null) return false;

    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    final userId = prefs.getInt('userId');
    if (token == null || userId == null) return false;
    

    final bytes = await pickedFile.readAsBytes();
    final imageUrl = await uploadProfileImages(userId, bytes, pickedFile.name);
    if (imageUrl == null) return false;

    final formData = FormData.fromMap({
      'files': MultipartFile.fromBytes(bytes, filename: pickedFile.name),
    });

 

        // 3️⃣ Update Strapi
    final updateRes = await dio.put(
      //'http://localhost:1337/api/users/$userId',
      '$domain/api/users/$userId',

      data: {
        "profileImageURL": imageUrl,
      },
      options: Options(
        headers: {'Authorization': 'Bearer $token'},
        contentType: 'application/json',
      ),
    );
     print("🟦 Update response: ${updateRes.statusCode}");


//------------------------------
    // final uploadRes = await dio.post(
    //   'http://localhost:1337/api/upload',
    //   data: formData,
    //   options: Options(
    //     headers: {'Authorization': 'Bearer $token'},
    //     validateStatus: (status) => true,
    //   ),
    // );
    // log("✅ Image uploaded: ${uploadRes.data}");

//------------------------------

    // if (uploadRes.data == null ||
    //     uploadRes.data is! List ||
    //     uploadRes.data.isEmpty ||
    //     uploadRes.data[0]['url'] == null) {
    //   print("⚠️ الصورة اترفعت لكن Strapi رجّع خطأ بعد الرفع");
    //   log("HEADERS => ${uploadRes.headers.map}");

    //   return false;
    // }
    // final uploadedImageUrl = uploadRes.data[uploadRes.data.length - 1]['url'];
    // print("✅ Extracted URL: $uploadedImageUrl");


//-----------------------------
// final filesRes = await dio.get(
//       'http://localhost:1337/api/upload/files',
//       options: Options(headers: {'Authorization': 'Bearer $token'}),
//     );

//     if (filesRes.data == null ) {
//       print("❌ No files found!");
//       return false;
//     }

//     // آخر ملف هو آخر صورة اترفعت
//     final lastFile = filesRes.data[filesRes.data.length - 1];
//     final uploadedUrl = lastFile["url"];

//     print("🎯 Actual uploaded file URL: $uploadedUrl");


//     // 2️⃣ تحديث البروفايل
//     final updateRes = await dio.put(
//       'http://localhost:1337/api/users/$userId',
//       data: {
//          "profileImageURL": uploadedUrl,
         
//       },
//       options: Options(
//         headers: {'Authorization': 'Bearer $token'},
//         contentType: 'application/json',
//         validateStatus: (status) => true,
//       ),
//     );
//     log("🟦 Update response: ${updateRes.statusCode}");

    return updateRes.statusCode == 200|| updateRes.statusCode == 201;

     }
    catch (e) {
      print("❌ uploadAndUpdateProfileImage error: $e");
      return false;
    }
  }







  Future<int?> getUserId() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getInt("userId");
  }

  Future<String> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString("token") ?? "";
  }
}
