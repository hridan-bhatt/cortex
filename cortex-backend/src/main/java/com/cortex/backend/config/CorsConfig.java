package com.cortex.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.List;

//THIS FILE IS FOR THE APIs. The /** pattern means it applies to every endpoint in my controller.

@Configuration//it defines beans which Spring will scan and call the @Bean methods at startup.
public class CorsConfig {// it tells the browser that it is ok for frontend running on a different port/origin to call my backend.

    //if frontend is on localhost5173 and backend is on localhost8080, the browser won't let 5173 origin requests to 8080 origin.
    //so when 5173 tries requesting 8080/api/graph, then browser doesn't let it do it.
    //CORS-(Cross-Origin Resource Sharing) : is the mechanism where the server tells the browser to trust the different port/origin.


    @Bean//this method will return a CorsFilter bean.
    //spring registers it in the servlet filter chain so every HTTP request goes through it.
    //Servlet filter adds CORS headers to response so that the mechanism can work.
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(List.of("*"));//allow any origin to call me(5173 or whatever the origin be)
        config.setAllowCredentials(true);//allow cookies and auth headers to be sent
        config.setAllowedMethods(List.of("*"));//Allow GET/POST/PUT/DELETE/OPTIONS/PATCH all the methods.
        config.setAllowedHeaders(List.of("*"));//Allow any header in the request.
        config.setExposedHeaders(List.of("*"));//let the browser read any response header.

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        // "/**" means apply this CORS config to every endpoint under the root
        return new CorsFilter(source);


        //Browser (React on :5173)
        //       │
        //       │  Request with Authorization header
        //       ▼
        //CorsFilter (this file)
        //       │
        //       │  Adds CORS headers, lets it through
        //       ▼
        //CortexController  →  Service  →  Repository  →  DB
        //       │
        //       │  Response comes back
        //       ▼
        //CorsFilter adds "Access-Control-Allow-Origin: *"
        //       │
        //       ▼
        //Browser sees the header → allows the response
    }
}
