package com.gcaforce.iptvpro
import okhttp3.*
import org.json.JSONObject
import java.util.concurrent.Executors

object ApiClient {
    private val client=OkHttpClient()
    private val executor=Executors.newSingleThreadExecutor()
    var token:String?=null

    fun post(path:String, body:JSONObject, callback:(Boolean,String)->Unit){
        executor.execute{
            try{
                val req=Request.Builder().url(ApiConfig.BASE_URL+path)
                    .post(body.toString().toRequestBody("application/json".toMediaType()))
                    .apply{ token?.let{header("Authorization","Bearer $it")} }.build()
                client.newCall(req).execute().use{r-> callback(r.isSuccessful,r.body?.string()?:"") }
            }catch(e:Exception){callback(false,e.message?:"network_error")}
        }
    }
    fun get(path:String, callback:(Boolean,String)->Unit){
        executor.execute{
            try{
                val req=Request.Builder().url(ApiConfig.BASE_URL+path).get()
                    .apply{ token?.let{header("Authorization","Bearer $it")} }.build()
                client.newCall(req).execute().use{r->callback(r.isSuccessful,r.body?.string()?:"")}
            }catch(e:Exception){callback(false,e.message?:"network_error")}
        }
    }
}